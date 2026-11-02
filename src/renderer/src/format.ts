import type { AppStatus } from '../../shared/types'

export const STATUS_LABEL: Record<AppStatus, string> = {
  unavailable: 'Podman unavailable',
  stopped: 'Stopped',
  starting: 'Starting',
  running: 'Starting',
  healthy: 'Running',
  error: 'Error',
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`
  return `${Math.round(bytes / 1e3)} kB`
}
