import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, WebContentsView } from 'electron'
import type { AppView } from '../shared/types'
import { loadCatalog, podName, podStatus, publicView, render, resolveValues, type CatalogApp } from './apps'
import * as podman from './podman'
import { SettingsStore } from './settings'

const STATUS_INTERVAL_MS = 5000

let win: BrowserWindow | null = null
let guest: WebContentsView | null = null
let catalog: CatalogApp[] = []
let settings: SettingsStore
const errors = new Map<string, string>()

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
    const view = publicView(entry.manifest, values(entry), errors.has(id) ? 'error' : status)
    view.error = errors.get(id)
    return view
  }))
}

async function pushStatus() {
  if (win && !win.isDestroyed()) win.webContents.send('apps:status', await views())
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
  ipcMain.on('guest:back', () => {
    const history = guest?.webContents.navigationHistory
    if (history?.canGoBack()) history.goBack()
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
    backgroundColor: '#0b0d12',
    webPreferences: { preload: join(__dirname, '../preload/shell.js'), sandbox: true, contextIsolation: true },
  })
  win.on('resize', fitGuest)
  win.on('closed', () => {
    win = null
    guest = null
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  catalog = loadCatalog(app.isPackaged ? join(process.resourcesPath, 'catalog') : join(app.getAppPath(), 'catalog'))
  settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'))
  registerIpc()
  createWindow()
  setInterval(pushStatus, STATUS_INTERVAL_MS)
})

app.on('window-all-closed', () => app.quit())
