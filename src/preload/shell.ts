// Launcher preload: the only bridge between the launcher UI and main.
import { contextBridge, ipcRenderer } from 'electron'
import type { AppView, ShellApi } from '../shared/types'

const api: ShellApi = {
  list: () => ipcRenderer.invoke('apps:list'),
  start: (id) => ipcRenderer.invoke('apps:start', id),
  stop: (id) => ipcRenderer.invoke('apps:stop', id),
  open: (id) => ipcRenderer.invoke('apps:open', id),
  saveSettings: (id, values) => ipcRenderer.invoke('apps:saveSettings', id, values),
  onStatus: (listener) => {
    const handler = (_: unknown, apps: AppView[]) => listener(apps)
    ipcRenderer.on('apps:status', handler)
    return () => ipcRenderer.off('apps:status', handler)
  },
}

contextBridge.exposeInMainWorld('homeapp', api)
