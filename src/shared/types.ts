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
  description?: string
  // Param key whose value is the host port the app's web UI listens on.
  portParam: string
  healthPath: string
  params: AppParam[]
}

export type AppStatus = 'unavailable' | 'stopped' | 'starting' | 'running' | 'healthy' | 'error'

export interface AppView {
  manifest: AppManifest
  status: AppStatus
  // Current setting values; secrets are never sent to the renderer.
  values: Record<string, string>
  error?: string
}

export interface ShellApi {
  list(): Promise<AppView[]>
  start(id: string): Promise<void>
  stop(id: string): Promise<void>
  open(id: string): Promise<void>
  saveSettings(id: string, values: Record<string, string>): Promise<void>
  onStatus(listener: (apps: AppView[]) => void): () => void
}
