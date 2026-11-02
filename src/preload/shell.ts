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

  providers: () => ipcRenderer.invoke('providers:list'),
  openProvider: (id, query) => ipcRenderer.invoke('providers:open', id, query),
  setProviderEnabled: (id, enabled) => ipcRenderer.invoke('providers:setEnabled', id, enabled),
  addProvider: (input) => ipcRenderer.invoke('providers:add', input),
  removeProvider: (id) => ipcRenderer.invoke('providers:remove', id),

  vaultStatus: () => ipcRenderer.invoke('vault:status'),
  saveLogin: (id, username, password) => ipcRenderer.invoke('vault:saveLogin', id, username, password),
  clearLogin: (id) => ipcRenderer.invoke('vault:clearLogin', id),

  hasImmichKey: () => ipcRenderer.invoke('immich:hasKey'),
  setImmichKey: (key) => ipcRenderer.invoke('immich:setKey', key),
  photos: () => ipcRenderer.invoke('immich:photos'),
}

contextBridge.exposeInMainWorld('homeapp', api)
