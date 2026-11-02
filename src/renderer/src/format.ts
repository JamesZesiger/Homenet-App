import type { AppStatus, CatalogStatus } from '../../shared/types'

export const STATUS_LABEL: Record<AppStatus, string> = {
  unavailable: 'Podman unavailable',
  stopped: 'Stopped',
  starting: 'Starting',
  running: 'Starting',
  healthy: 'Running',
  error: 'Error',
}

// Running, or on its way up.
export const isUp = (status: AppStatus) => status === 'healthy' || status === 'running' || status === 'starting'

// The message main threw, without Electron's "Error invoking remote method" prefix.
export const errorText = (err: unknown) =>
  (err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export const percent = (status: CatalogStatus) =>
  status.total ? Math.round((100 * (status.done ?? 0)) / status.total) : 0

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`
  return `${Math.round(bytes / 1e3)} kB`
}
