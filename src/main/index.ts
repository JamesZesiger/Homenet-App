import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, components, ipcMain, net, powerMonitor, protocol, safeStorage, session, WebContentsView } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { Intent } from '../shared/input/intents'
import type { AppView, CatalogStatus, PhotoResult, ProviderInput, ProviderView, SearchProviderInput, SearchProviderView, StatSample, VaultStatus } from '../shared/types'
import { checkSettings, loadCatalog, podName, podSample, podStatus, publicView, render, resolveValues, type CatalogApp } from './apps'
import { CustomList } from './files'
import { IconCache } from './icons'
import { randomAssetIds, thumbnail } from './immich'
import * as podman from './podman'
import { resume } from './resume'
import { wikidataLink } from './deeplinks'
import { ProviderStore, providerForUrl, providerUrl } from './providers'
import { searchUrl, toSearchProvider, type SearchProvider } from './searchProviders'
import { TitleStore } from './titles'
import { Tmdb } from './tmdb'
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
const TMDB_KEY = 'tmdb:apiKey'
// What a TV page expects from a remote, by controller intent.
const TV_KEYS: Partial<Record<Intent, string>> = { up: 'Up', down: 'Down', left: 'Left', right: 'Right', activate: 'Enter', back: 'Escape' }
// A downloaded update waits until nothing is open and no one has touched the
// box for this long, so it never cuts off a show.
const UPDATE_IDLE_S = 10 * 60

// A dev run (anything unpackaged) starts from a scratch profile every time and
// stops its pods when it closes; only the title catalogue is kept between
// runs, so TMDB isn't re-fetched each time. The packaged app keeps everything
// and leaves its pods running.
const dev = !app.isPackaged
const keepDir = dev ? join(app.getPath('appData'), 'homeapp-dev') : app.getPath('userData')
// One homeapp at a time: a second launch just brings the first to the front.
// Taken before the dev profile switch, so dev runs share one lock and a second
// one can't sweep away the first one's scratch profile below.
if (!app.requestSingleInstanceLock()) app.exit(0)
else if (dev) {
  // A run killed outright (Ctrl+C in some terminals) never gets to delete its
  // scratch profile, so each run clears out the ones before it.
  for (const name of readdirSync(tmpdir())) {
    if (name.startsWith('homeapp-dev-')) rmSync(join(tmpdir(), name), { recursive: true, force: true })
  }
  app.setPath('userData', mkdtempSync(join(tmpdir(), 'homeapp-dev-')))
}

let win: BrowserWindow | null = null
let guest: WebContentsView | null = null
let catalog: CatalogApp[] = []
let settings: SettingsStore
// Generated app passwords live with the app data they unlock, so they outlast
// dev runs' scratch settings just as the pods' volumes do.
let secrets: SettingsStore
let vault: Vault
let providers: ProviderStore
let icons: IconCache
let titles: TitleStore
let searchProviders: CustomList<SearchProvider>
const iconLookups = new Map<string, Promise<{ body: Buffer; type: string } | undefined>>()
const iconFailedAt = new Map<string, number>()
const errors = new Map<string, string>()
// True while homeapp is starting the Podman machine after a reboot.
let podmanStarting = false
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
  const { id } = entry.manifest
  const { values, generated } = resolveValues(entry.manifest, { ...secrets.get(id), ...settings.get(id) })
  if (Object.keys(generated).length) secrets.set(id, generated)
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
  // One podman call: if listing pods fails, Podman isn't available.
  const pods = await podman.listPods().catch(() => null)
  return Promise.all(catalog.map(async (entry) => {
    const { id } = entry.manifest
    const pod = pods?.find((p) => p.name === podName(id))
    const status = pods
      ? podStatus(pod, !!pod && (await healthy(entry)))
      : podmanStarting && wanted().includes(id) ? 'starting' : 'unavailable'
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

// Single-flight: a slow or stuck Podman must not stack up status checks.
let ticking = false
async function tick() {
  if (ticking) return
  ticking = true
  try {
    await sampleStats()
    await pushStatus()
  } catch {
    // the next tick tries again
  } finally {
    ticking = false
  }
}

// Start and stop for one app run one after another, in the order asked, so
// the pod ends up matching the last request even when presses overlap.
const queues = new Map<string, Promise<void>>()
function act(id: string, action: (yaml: string) => Promise<void>): Promise<void> {
  const next = (queues.get(id) ?? Promise.resolve()).then(() => runAction(id, action))
  queues.set(id, next)
  return next
}

async function runAction(id: string, action: (yaml: string) => Promise<void>) {
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

// Bumped whenever the hosted view changes, so a slow lookup (Play) can tell
// the user has since moved on and drop its result.
let guestToken = 0

function closeGuest() {
  guestToken++
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
  const agent = providerForUrl(url, providers.all())?.userAgent
  if (agent) view.webContents.setUserAgent(agent)
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

// TMDB key from settings, or TMDB_API_KEY in the environment (handy for dev
// runs, whose settings reset every time).
const tmdbKey = () => vault.get(TMDB_KEY) || process.env.TMDB_API_KEY || ''
const tmdb = () => new Tmdb(tmdbKey(), net.fetch)

function pushCatalogStatus(status: CatalogStatus) {
  if (win && !win.isDestroyed()) win.webContents.send('catalog:status', status)
}

function catalogStatus(): CatalogStatus {
  return tmdbKey() || titles.status.state !== 'idle' ? titles.status : { state: 'no-key', titles: 0 }
}

function refreshCatalog(force = false) {
  const key = tmdbKey()
  if (!key) {
    pushCatalogStatus(catalogStatus())
    return
  }
  if (force || titles.needsRefresh()) titles.refresh(tmdb(), pushCatalogStatus)
}

// Search buttons: one per streaming provider with a search page, then the
// user's own.
function allSearchProviders(): SearchProvider[] {
  const fromStreaming = providers.all()
    .filter((p) => p.search)
    .map((p) => ({ id: p.id, name: p.name, url: p.search as string, format: 'encoded' as const }))
  return [...fromStreaming, ...searchProviders.items]
}

function searchProviderViews(): SearchProviderView[] {
  const prefs = settings.get('searchProviders')
  const shown = settings.get('providers')
  return allSearchProviders().map((p) => ({
    id: p.id,
    name: p.name,
    url: p.url,
    format: p.format,
    custom: !!p.custom,
    // Built-in buttons follow whether the streaming service is on home.
    enabled: prefs[p.id] ? prefs[p.id] === 'on' : p.custom || shown[p.id] !== 'off',
  }))
}

// The page that plays a title: the service's own page for it when Wikidata
// knows it, otherwise the service's search for the title's name.
async function playUrl(key: string, service: string): Promise<string | undefined> {
  const title = titles.find(key)
  const provider = providers.find(service)
  if (!title || !provider) return undefined
  const cached = titles.link(key, service)
  if (cached) return cached
  try {
    const imdb = await tmdb().imdbId(title.type, title.tmdbId)
    const link = imdb && (await wikidataLink(net.fetch, imdb, service, title.type))
    if (link) {
      titles.saveLink(key, service, link)
      return link
    }
  } catch {
    // offline or rate limited: the search page still works
  }
  return providerUrl(provider, title.name)
}

// Apps the user has started and not since stopped: these come back after a
// restart.
function wanted(): string[] {
  return Object.entries(settings.get('autostart')).filter(([, v]) => v === 'on').map(([id]) => id)
}

function setWanted(id: string, on: boolean) {
  settings.set('autostart', { [id]: on ? 'on' : 'off' })
}

async function resumeApps() {
  await resume(wanted(), {
    available: podman.available,
    startMachine: podman.startMachine,
    listPods: podman.listPods,
    // Asked again at each start: the user may have stopped it meanwhile.
    start: (id) => (wanted().includes(id) ? act(id, podman.playKube) : Promise.resolve()),
    podName,
    onPodmanStarting: (starting) => {
      podmanStarting = starting
      pushStatus()
    },
  })
}

// `forget` is false when dev runs tidy up on close: that isn't the user
// choosing to stop the apps.
async function stopAllApps(forget = true) {
  if (forget) for (const id of wanted()) setWanted(id, false)
  const pods = await podman.listPods().catch(() => [])
  const running = catalog.filter((entry) => pods.some((p) => p.name === podName(entry.manifest.id)))
  await Promise.all(running.map((entry) => act(entry.manifest.id, podman.downKube)))
}

function registerIpc() {
  ipcMain.handle('apps:list', () => views())
  ipcMain.handle('apps:start', (_, id: string) => {
    setWanted(find(id).manifest.id, true)
    return act(id, podman.playKube)
  })
  ipcMain.handle('apps:stop', (_, id: string) => {
    setWanted(find(id).manifest.id, false)
    return act(id, podman.downKube)
  })
  ipcMain.handle('apps:open', (_, id: string) => openGuest(appUrl(find(id))))
  ipcMain.handle('apps:saveSettings', async (_, id: string, next: Record<string, string>) => {
    settings.set(id, checkSettings(find(id).manifest, next))
    // Saving applies the change: a running app restarts with the new settings,
    // so homeapp never checks a port the app isn't listening on.
    const pods = await podman.listPods().catch(() => [])
    if (pods.some((p) => p.name === podName(id) && p.status !== 'Exited')) await act(id, podman.playKube)
    else await pushStatus()
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

  ipcMain.handle('searchProviders:list', () => searchProviderViews())
  ipcMain.handle('searchProviders:add', (_, input: SearchProviderInput) => {
    try {
      searchProviders.add(toSearchProvider(input, allSearchProviders().map((p) => p.id)))
      return {}
    } catch (err) {
      return { error: (err as Error).message }
    }
  })
  ipcMain.handle('searchProviders:remove', (_, id: string) => {
    if (searchProviders.remove(id)) settings.set('searchProviders', { [id]: '' })
  })
  ipcMain.handle('searchProviders:setEnabled', (_, id: string, enabled: boolean) => {
    if (allSearchProviders().some((p) => p.id === id)) settings.set('searchProviders', { [id]: enabled ? 'on' : 'off' })
  })
  ipcMain.handle('searchProviders:open', (_, id: string, query: string) => {
    const provider = allSearchProviders().find((p) => p.id === id)
    if (provider && query.trim()) openGuest(searchUrl(provider, query))
  })

  ipcMain.handle('titles:search', (_, query: string) => titles.search(query))
  ipcMain.handle('titles:get', (_, key: string) => titles.get(key))
  ipcMain.handle('titles:play', async (_, key: string, service: string) => {
    const token = guestToken
    const url = await playUrl(key, service)
    if (url && token === guestToken) openGuest(url)
  })
  ipcMain.handle('catalog:status', () => catalogStatus())
  ipcMain.handle('catalog:refresh', () => refreshCatalog(true))
  ipcMain.handle('tmdb:hasKey', () => !!tmdbKey())
  ipcMain.handle('tmdb:setKey', (_, key: string) => {
    if (key.trim()) vault.set(TMDB_KEY, key.trim())
    else vault.delete(TMDB_KEY)
    refreshCatalog()
  })
  ipcMain.handle('apps:stopAll', () => stopAllApps())

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
  // TV pages run their own remote navigation, so the guest's controller
  // presses real keys there instead of moving focus.
  ipcMain.handle('guest:tv', (event) =>
    event.sender === guest?.webContents && !!providerForUrl(event.senderFrame?.url ?? '', providers.all())?.userAgent)
  ipcMain.on('guest:key', (event, intent: Intent) => {
    const keyCode = TV_KEYS[intent]
    if (!keyCode || event.sender !== guest?.webContents) return
    guest.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    guest.webContents.sendInputEvent({ type: 'keyUp', keyCode })
  })
}

// New versions come from the GitHub Releases that CI publishes for v* tags.
function autoUpdate() {
  autoUpdater.on('error', (err) => console.error('Update failed:', err.message))
  autoUpdater.once('update-downloaded', () => {
    setInterval(() => {
      if (!guest && powerMonitor.getSystemIdleTime() >= UPDATE_IDLE_S) autoUpdater.quitAndInstall(true, true)
    }, 60_000)
  })
  const check = () => autoUpdater.checkForUpdates().catch(() => {})
  check()
  setInterval(check, 6 * 3600 * 1000)
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
  secrets = new SettingsStore(join(keepDir, 'app-secrets.json'))
  // Linux without a keychain (WSL, minimal desktops) has nothing to encrypt
  // with, and Electron refuses unless told to fall back to obfuscation; the
  // vault pages warn when that is what's in use. A no-op on Windows and macOS.
  if (process.platform === 'linux' && !safeStorage.isEncryptionAvailable()) safeStorage.setUsePlainTextEncryption(true)
  vault = new Vault(join(app.getPath('userData'), 'vault.json'), {
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (encrypted) => safeStorage.decryptString(encrypted),
  })
  // Streaming sites refuse browsers that announce themselves as Electron.
  const ua = session.defaultSession.getUserAgent()
  session.defaultSession.setUserAgent(ua.replace(/ (homeapp|Electron)\/\S+/g, ''))
  providers = new ProviderStore(join(app.getPath('userData'), 'providers.json'))
  icons = new IconCache(join(app.getPath('userData'), 'tile-icons'), (url) => net.fetch(url, { signal: AbortSignal.timeout(10_000) }))
  titles = new TitleStore(join(keepDir, 'titles.json'), join(keepDir, 'title-links.json'))
  searchProviders = new CustomList(join(app.getPath('userData'), 'search-providers.json'))
  serveImages()
  registerIpc()
  createWindow()
  setInterval(tick, STATUS_INTERVAL_MS)
  // After a reboot nothing is running: start Podman and the apps left on.
  resumeApps()
  // First start builds the catalogue; after that it refreshes weekly.
  refreshCatalog()
  setInterval(refreshCatalog, 6 * 3600 * 1000)
  if (!dev) autoUpdate()
  // Widevine installs in the background; the launcher doesn't wait for it,
  // only DRM playback does.
  components.whenReady().catch((err: Error) => console.error('Widevine unavailable:', err.message))
})

app.on('window-all-closed', () => app.quit())
app.on('second-instance', () => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
})

// Pods outlive the app, except in dev, where closing stops them and the
// scratch profile is deleted.
let stopping = false
app.on('before-quit', (event) => {
  if (!dev || stopping) return
  event.preventDefault()
  stopping = true
  stopAllApps(false).finally(() => app.quit())
})
app.on('quit', () => {
  if (dev) rmSync(app.getPath('userData'), { recursive: true, force: true })
})
// Ctrl+C on `npm run dev` should still stop the pods.
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => app.quit())
