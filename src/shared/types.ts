// Contract between the main process and the launcher renderer.

export type ParamType = 'path' | 'secret' | 'string' | 'port'

export interface AppParam {
  key: string
  label: string
  type: ParamType
  default?: string
  // The homenet .env key holding the same setting, for migrating an install.
  homenetEnv?: string
}

export interface AppManifest {
  id: string
  name: string
  // Accent for the app's tile in the launcher.
  color?: string
  description?: string
  // Has a web UI people use day to day (not just an admin page), so it also
  // gets a tile in the Apps row. Every app is a service in the System panel.
  userUi?: boolean
  // Param key whose value is the host port the app's web UI listens on.
  portParam: string
  healthPath: string
  params: AppParam[]
}

export type AppStatus = 'unavailable' | 'stopped' | 'starting' | 'running' | 'healthy' | 'error'

export interface StatSample {
  at: number
  cpuPercent: number
  memBytes: number
}

export interface AppView {
  manifest: AppManifest
  status: AppStatus
  // Current setting values; secrets are never sent to the renderer.
  values: Record<string, string>
  // Recent resource samples while running, oldest first.
  stats: StatSample[]
  error?: string
}

export interface ProviderView {
  id: string
  name: string
  color: string
  enabled: boolean
  // A login is saved in the vault (the credentials themselves never leave main).
  hasLogin: boolean
  savedUsername?: string
  home: string
  // Added by the user (removable), rather than built in (hide only).
  custom: boolean
}

export interface ProviderInput {
  name: string
  home: string
  search?: string
  color: string
}

// How a search provider wants the words in its address: %20, + or a-slug.
export type QueryFormat = 'encoded' | 'plus' | 'dash'

export interface SearchProviderInput {
  name: string
  url: string
  format: QueryFormat
}

export interface SearchProviderView {
  id: string
  name: string
  url: string
  format: QueryFormat
  enabled: boolean
  // Added by the user; the rest come from streaming providers' search pages.
  custom: boolean
}

// A new homeapp version on its way in.
export interface UpdateStatus {
  version: string
  // Downloaded so far; 100 once it's waiting to install.
  percent: number
}

export interface CatalogStatus {
  state: 'idle' | 'loading' | 'ready' | 'error' | 'no-key'
  titles: number
  updatedAt?: number
  // While loading: discover pages fetched, out of those known so far.
  done?: number
  total?: number
  error?: string
}

export interface TitleHit {
  key: string
  name: string
  type: 'movie' | 'tv'
  year?: number
  poster?: string
  // Provider ids of the services streaming it.
  services: string[]
}

export interface TitleDetail extends TitleHit {
  overview: string
  backdrop?: string
}

export interface VaultStatus {
  // False when the OS has no keychain to protect the vault (e.g. Linux without
  // a secret service), so contents are only obfuscated.
  protected: boolean
  backend: string
}

export interface Photo {
  id: string
  url: string
}

export interface PhotoResult {
  photos: Photo[]
  // Why there are no photos, when there are none.
  reason?: string
}

export interface ShellApi {
  list(): Promise<AppView[]>
  start(id: string): Promise<void>
  stop(id: string): Promise<void>
  open(id: string): Promise<void>
  saveSettings(id: string, values: Record<string, string>): Promise<void>
  onStatus(listener: (apps: AppView[]) => void): () => void

  providers(): Promise<ProviderView[]>
  openProvider(id: string, query?: string): Promise<void>
  setProviderEnabled(id: string, enabled: boolean): Promise<void>
  // Resolves with a message saying what to fix when the input is rejected.
  addProvider(input: ProviderInput): Promise<{ error?: string }>
  removeProvider(id: string): Promise<void>

  vaultStatus(): Promise<VaultStatus>
  saveLogin(providerId: string, username: string, password: string): Promise<void>
  clearLogin(providerId: string): Promise<void>

  searchProviders(): Promise<SearchProviderView[]>
  addSearchProvider(input: SearchProviderInput): Promise<{ error?: string }>
  removeSearchProvider(id: string): Promise<void>
  setSearchProviderEnabled(id: string, enabled: boolean): Promise<void>
  openSearchProvider(id: string, query: string): Promise<void>

  searchTitles(query: string): Promise<TitleHit[]>
  title(key: string): Promise<TitleDetail | undefined>
  play(key: string, service: string): Promise<void>
  catalogStatus(): Promise<CatalogStatus>
  refreshCatalog(): Promise<void>
  onCatalogStatus(listener: (status: CatalogStatus) => void): () => void
  updateStatus(): Promise<UpdateStatus | null>
  onUpdateStatus(listener: (status: UpdateStatus | null) => void): () => void
  hasTmdbKey(): Promise<boolean>
  setTmdbKey(key: string): Promise<void>
  stopAllApps(): Promise<void>

  hasImmichKey(): Promise<boolean>
  setImmichKey(key: string): Promise<void>
  photos(): Promise<PhotoResult>
}
