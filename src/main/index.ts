import { join } from 'node:path'
import { app, BrowserWindow, components, ipcMain, net, protocol, safeStorage, session, WebContentsView } from 'electron'
import type { AppView, PhotoResult, ProviderInput, ProviderView, StatSample, VaultStatus } from '../shared/types'
import { loadCatalog, podName, podSample, podStatus, publicView, render, resolveValues, type CatalogApp } from './apps'
import { IconCache } from './icons'
import { randomAssetIds, thumbnail } from './immich'
import * as podman from './podman'
import { ProviderStore, providerForUrl, providerUrl } from './providers'
import { SettingsStore } from './settings'
import { Vault } from './vault'

const STATUS_INTERVAL_MS = 5000
// The launcher is laid out for this size and zoomed to fit the window, so it
// looks the same on a laptop, a 1080p TV or a 4K one.
const DESIGN_WIDTH = 1600
const DESIGN_HEIGHT = 900
// Five minutes of samples at the status interval.
const STATS_KEPT = 60
const PHOTO_COUNT = 10
const IMMICH_KEY = 'immich:apiKey'
const IMG_SCHEME = 'homeapp-img'
const ASSET_ID = /^[0-9a-f-]{36}$/
const ICON_KEY = /^(provider|app)-([a-z0-9-]+)$/
// After a failed icon lookup (say the app is stopped), wait before retrying.
const ICON_RETRY_MS = 60_000

let win: BrowserWindow | null = null
let guest: WebContentsView | null = null
let catalog: CatalogApp[] = []
let settings: SettingsStore
let vault: Vault
let providers: ProviderStore
let icons: IconCache
const iconLookups = new Map<string, Promise<{ body: Buffer; type: string } | undefined>>()
const iconFailedAt = new Map<string, number>()
const errors = new Map<string, string>()
const history = new Map<string, StatSample[]>()

// Photo thumbnails need the Immich API key, which the renderer never sees, so
// main serves them on its own scheme.
protocol.registerSchemesAsPrivileged([{ scheme: IMG_SCHEME, privileges: { standard: true, secure: true } }])

function find(id: string): CatalogApp {
  const entry = catalog.find((a) => a.manifest.id === id)
  if (!entry) throw new Error(`Unknown app ${id}`)
  return entry
}

function values(entry: CatalogApp): Record<string, string> {
  const { values, generated } = resolveValues(entry.manifest, settings.get(entry.manifest.id))
  if (Object.keys(generated).length) settings.set(entry.manifest.id, generated)
  return values
}

const appUrl = (entry: CatalogApp, path = '') =>
  `http://localhost:${values(entry)[entry.manifest.portParam]}${path}`

async function healthy(entry: CatalogApp): Promise<boolean> {
  try {
    const res = await fetch(appUrl(entry, entry.manifest.healthPath), { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

async function views(): Promise<AppView[]> {
  const pods = (await podman.available()) ? await podman.listPods() : null
  return Promise.all(catalog.map(async (entry) => {
    const { id } = entry.manifest
    const pod = pods?.find((p) => p.name === podName(id))
    const status = pods ? podStatus(pod, !!pod && (await healthy(entry))) : 'unavailable'
    const view = publicView(entry.manifest, values(entry), errors.has(id) ? 'error' : status, history.get(id))
    view.error = errors.get(id)
    return view
  }))
}

async function sampleStats() {
  let all: podman.ContainerStats[]
  try {
    all = await podman.stats()
  } catch {
    all = []
  }
  const now = Date.now()
  for (const { manifest } of catalog) {
    const sample = podSample(all, manifest.id, now)
    if (!sample) {
      history.delete(manifest.id)
      continue
    }
    history.set(manifest.id, [...(history.get(manifest.id) ?? []), sample].slice(-STATS_KEPT))
  }
}

async function pushStatus() {
  if (win && !win.isDestroyed()) win.webContents.send('apps:status', await views())
}

async function tick() {
  await sampleStats()
  await pushStatus()
}

async function act(id: string, action: (yaml: string) => Promise<void>) {
  const entry = find(id)
  errors.delete(id)
  try {
    await action(render(entry.template, entry.manifest, values(entry)))
  } catch (err) {
    errors.set(id, (err as Error).message)
  } finally {
    await pushStatus()
  }
}

function providerViews(): ProviderView[] {
  const prefs = settings.get('providers')
  return providers.all().map((p) => {
    const login = vault.getLogin(p.id)
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      enabled: prefs[p.id] !== 'off',
      hasLogin: !!login,
      savedUsername: login?.username,
      canSearch: !!p.search,
      home: p.home,
      custom: !!p.custom,
    }
  })
}

function vaultStatus(): VaultStatus {
  const backend = process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : 'os'
  return { protected: safeStorage.isEncryptionAvailable() && backend !== 'basic_text', backend }
}

const immichUrl = () => appUrl(find('immich'))

async function photos(): Promise<PhotoResult> {
  const key = vault.get(IMMICH_KEY)
  if (!key) return { photos: [], reason: 'Add an Immich API key in Settings to show photos here.' }
  try {
    const ids = await randomAssetIds(immichUrl(), key, PHOTO_COUNT)
    if (!ids.length) return { photos: [], reason: 'No photos in Immich yet.' }
    return { photos: ids.map((id) => ({ id, url: `${IMG_SCHEME}://immich/${id}` })) }
  } catch (err) {
    const reason = (err as Error).name === 'TimeoutError' || (err as Error).message === 'fetch failed'
      ? 'Immich is not running.'
      : (err as Error).message
    return { photos: [], reason }
  }
}

// The page a tile's icon is looked up from.
function iconPage(key: string): string | undefined {
  const [, kind, id] = ICON_KEY.exec(key) ?? []
  if (kind === 'provider') {
    const provider = providers.find(id)
    return provider?.iconPage ?? provider?.home
  }
  const entry = catalog.find((a) => a.manifest.id === id)
  return entry && appUrl(entry, '/')
}

async function icon(key: string) {
  // The key names a file in the cache, so it must match before touching disk.
  if (!ICON_KEY.test(key)) return undefined
  const cached = icons.cached(key)
  if (cached) return cached
  const page = iconPage(key)
  if (!page || Date.now() - (iconFailedAt.get(key) ?? 0) < ICON_RETRY_MS) return undefined
  let lookup = iconLookups.get(key)
  if (!lookup) {
    lookup = icons.fetch(key, page).catch(() => undefined).finally(() => iconLookups.delete(key))
    iconLookups.set(key, lookup)
  }
  const found = await lookup
  if (!found) iconFailedAt.set(key, Date.now())
  return found
}

// homeapp-img://immich/<asset id> is an Immich photo, homeapp-img://icon/<key>
// a tile icon. Both need things the renderer must not have: the Immich API
// key, and network access outside the launcher.
function serveImages() {
  protocol.handle(IMG_SCHEME, async (req) => {
    const url = new URL(req.url)
    const name = url.pathname.slice(1)
    if (url.host === 'icon') {
      const found = await icon(name)
      return found
        ? new Response(new Uint8Array(found.body), { headers: { 'content-type': found.type } })
        : new Response(null, { status: 404 })
    }
    const key = vault.get(IMMICH_KEY)
    if (url.host !== 'immich' || !key || !ASSET_ID.test(name)) return new Response(null, { status: 404 })
    return thumbnail(immichUrl(), key, name)
  })
}

function fitLauncher() {
  if (!win) return
  const { width, height } = win.getContentBounds()
  win.webContents.setZoomFactor(Math.max(0.25, Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT)))
}

// Content bounds are in screen coordinates; the view is placed in the window's.
function fitGuest() {
  if (guest && win) guest.setBounds({ ...win.getContentBounds(), x: 0, y: 0 })
}

function closeGuest() {
  if (!guest || !win) return
  win.contentView.removeChildView(guest)
  guest.webContents.close()
  guest = null
  win.webContents.focus()
}

function openGuest(url: string) {
  if (!win) return
  closeGuest()
  guest = new WebContentsView({
    webPreferences: { preload: join(__dirname, '../preload/guest.js'), sandbox: true, contextIsolation: true },
  })
  const view = guest
  // Keep everything in this one view: popups would open windows the
  // controller can't reach.
  view.webContents.setWindowOpenHandler(({ url }) => {
    view.webContents.loadURL(url)
    return { action: 'deny' }
  })
  win.contentView.addChildView(view)
  fitGuest()
  view.webContents.loadURL(url)
  view.webContents.focus()
}

function registerIpc() {
  ipcMain.handle('apps:list', () => views())
  ipcMain.handle('apps:start', (_, id: string) => act(id, podman.playKube))
  ipcMain.handle('apps:stop', (_, id: string) => act(id, podman.downKube))
  ipcMain.handle('apps:open', (_, id: string) => openGuest(appUrl(find(id))))
  ipcMain.handle('apps:saveSettings', async (_, id: string, next: Record<string, string>) => {
    find(id)
    settings.set(id, next)
    await pushStatus()
  })

  ipcMain.handle('providers:list', () => providerViews())
  ipcMain.handle('providers:open', (_, id: string, query?: string) => {
    const provider = providers.find(id)
    if (provider) openGuest(providerUrl(provider, query))
  })
  ipcMain.handle('providers:setEnabled', (_, id: string, enabled: boolean) => {
    if (providers.find(id)) settings.set('providers', { [id]: enabled ? 'on' : 'off' })
  })
  ipcMain.handle('providers:add', (_, input: ProviderInput) => {
    try {
      providers.add(input)
      return {}
    } catch (err) {
      return { error: (err as Error).message }
    }
  })
  ipcMain.handle('providers:remove', (_, id: string) => {
    if (!providers.remove(id)) return
    vault.delete(`login:${id}`)
    icons.forget(`provider-${id}`)
  })

  ipcMain.handle('vault:status', () => vaultStatus())
  ipcMain.handle('vault:saveLogin', (_, id: string, username: string, password: string) => {
    if (providers.find(id)) vault.setLogin(id, { username, password })
  })
  ipcMain.handle('vault:clearLogin', (_, id: string) => vault.delete(`login:${id}`))
  // Only the hosted view may ask, and only for the provider whose site it is on.
  ipcMain.handle('vault:fill', (event) => {
    if (!guest || event.sender !== guest.webContents) return null
    const provider = providerForUrl(event.senderFrame?.url ?? '', providers.all())
    return provider ? (vault.getLogin(provider.id) ?? null) : null
  })

  ipcMain.handle('immich:hasKey', () => !!vault.get(IMMICH_KEY))
  ipcMain.handle('immich:setKey', (_, key: string) => {
    if (key.trim()) vault.set(IMMICH_KEY, key.trim())
    else vault.delete(IMMICH_KEY)
  })
  ipcMain.handle('immich:photos', () => photos())

  ipcMain.on('guest:back', () => {
    const nav = guest?.webContents.navigationHistory
    if (nav?.canGoBack()) nav.goBack()
    else closeGuest()
  })
  ipcMain.on('guest:home', closeGuest)
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    // The TV box runs packaged builds full screen; development stays windowed.
    fullscreen: app.isPackaged,
    autoHideMenuBar: true,
    backgroundColor: '#0a1220',
    webPreferences: { preload: join(__dirname, '../preload/shell.js'), sandbox: true, contextIsolation: true },
  })
  win.on('resize', () => {
    fitLauncher()
    fitGuest()
  })
  win.webContents.on('did-finish-load', fitLauncher)
  win.on('closed', () => {
    win = null
    guest = null
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  catalog = loadCatalog(app.isPackaged ? join(process.resourcesPath, 'catalog') : join(app.getAppPath(), 'catalog'))
  settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'))
  vault = new Vault(join(app.getPath('userData'), 'vault.json'), {
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (encrypted) => safeStorage.decryptString(encrypted),
  })
  // Streaming sites refuse browsers that announce themselves as Electron.
  const ua = session.defaultSession.getUserAgent()
  session.defaultSession.setUserAgent(ua.replace(/ (homeapp|Electron)\/\S+/g, ''))
  providers = new ProviderStore(join(app.getPath('userData'), 'providers.json'))
  icons = new IconCache(join(app.getPath('userData'), 'tile-icons'), (url) => net.fetch(url))
  serveImages()
  registerIpc()
  createWindow()
  setInterval(tick, STATUS_INTERVAL_MS)
  // Widevine installs in the background; the launcher doesn't wait for it,
  // only DRM playback does.
  components.whenReady().catch((err: Error) => console.error('Widevine unavailable:', err.message))
})

app.on('window-all-closed', () => app.quit())
