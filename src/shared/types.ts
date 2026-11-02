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
  canSearch: boolean
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

  hasImmichKey(): Promise<boolean>
  setImmichKey(key: string): Promise<void>
  photos(): Promise<PhotoResult>
}
