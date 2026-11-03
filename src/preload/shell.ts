// Launcher preload: the only bridge between the launcher UI and main.
import { contextBridge, ipcRenderer } from 'electron'
import type { ShellApi } from '../shared/types'

// Pushed updates from main: subscribe, and get back the unsubscribe.
const subscribe = <T>(channel: string) => (listener: (value: T) => void) => {
  const handler = (_: unknown, value: T) => listener(value)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.off(channel, handler)
  }
}

const api: ShellApi = {
  list: () => ipcRenderer.invoke('apps:list'),
  start: (id) => ipcRenderer.invoke('apps:start', id),
  stop: (id) => ipcRenderer.invoke('apps:stop', id),
  open: (id) => ipcRenderer.invoke('apps:open', id),
  saveSettings: (id, values) => ipcRenderer.invoke('apps:saveSettings', id, values),
  onStatus: subscribe('apps:status'),

  providers: () => ipcRenderer.invoke('providers:list'),
  openProvider: (id, query) => ipcRenderer.invoke('providers:open', id, query),
  setProviderEnabled: (id, enabled) => ipcRenderer.invoke('providers:setEnabled', id, enabled),
  addProvider: (input) => ipcRenderer.invoke('providers:add', input),
  removeProvider: (id) => ipcRenderer.invoke('providers:remove', id),

  vaultStatus: () => ipcRenderer.invoke('vault:status'),
  saveLogin: (id, username, password) => ipcRenderer.invoke('vault:saveLogin', id, username, password),
  clearLogin: (id) => ipcRenderer.invoke('vault:clearLogin', id),

  searchProviders: () => ipcRenderer.invoke('searchProviders:list'),
  addSearchProvider: (input) => ipcRenderer.invoke('searchProviders:add', input),
  removeSearchProvider: (id) => ipcRenderer.invoke('searchProviders:remove', id),
  setSearchProviderEnabled: (id, enabled) => ipcRenderer.invoke('searchProviders:setEnabled', id, enabled),
  openSearchProvider: (id, query) => ipcRenderer.invoke('searchProviders:open', id, query),

  searchTitles: (query) => ipcRenderer.invoke('titles:search', query),
  title: (key) => ipcRenderer.invoke('titles:get', key),
  play: (key, service) => ipcRenderer.invoke('titles:play', key, service),
  catalogStatus: () => ipcRenderer.invoke('catalog:status'),
  refreshCatalog: () => ipcRenderer.invoke('catalog:refresh'),
  onCatalogStatus: subscribe('catalog:status'),
  updateStatus: () => ipcRenderer.invoke('update:status'),
  onUpdateStatus: subscribe('update:status'),
  hasTmdbKey: () => ipcRenderer.invoke('tmdb:hasKey'),
  setTmdbKey: (key) => ipcRenderer.invoke('tmdb:setKey', key),
  stopAllApps: () => ipcRenderer.invoke('apps:stopAll'),

  hasImmichKey: () => ipcRenderer.invoke('immich:hasKey'),
  setImmichKey: (key) => ipcRenderer.invoke('immich:setKey', key),
  photos: () => ipcRenderer.invoke('immich:photos'),
}

contextBridge.exposeInMainWorld('homeapp', api)
