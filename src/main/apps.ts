// The app catalog: each catalog/<id>/ holds homeapp.json (what the launcher
// shows and which settings it needs) and pod.yaml (a Kubernetes Pod that
// `podman kube play` runs). pod.yaml refers to settings as ${KEY}.
import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AppManifest, AppStatus, AppView } from '../shared/types'
import type { PodState } from './podman'

export interface CatalogApp {
  manifest: AppManifest
  template: string
}

export function loadCatalog(dir: string): CatalogApp[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({
      manifest: JSON.parse(readFileSync(join(dir, d.name, 'homeapp.json'), 'utf8')) as AppManifest,
      template: readFileSync(join(dir, d.name, 'pod.yaml'), 'utf8'),
    }))
    .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))
}

export const podName = (id: string) => `homeapp-${id}`

// Host paths as the podman machine sees them: on Windows, C:\photos lives at
// /mnt/c/photos inside the WSL2 VM. `~` expands to the user's home either way.
export function toMachinePath(path: string, platform = process.platform, home = homedir()): string {
  const expanded = path.replace(/^~(?=$|[\\/])/, home)
  if (platform !== 'win32') return expanded
  const drive = /^([A-Za-z]):[\\/]?(.*)$/.exec(expanded)
  if (!drive) return expanded.replace(/\\/g, '/')
  return `/mnt/${drive[1].toLowerCase()}/${drive[2].replace(/\\/g, '/')}`
}

// Settings the user saved, falling back to manifest defaults. Secrets with no
// value are generated once; the caller persists anything in `generated`.
export function resolveValues(manifest: AppManifest, saved: Record<string, string>) {
  const values: Record<string, string> = { TZ: Intl.DateTimeFormat().resolvedOptions().timeZone }
  const generated: Record<string, string> = {}
  for (const p of manifest.params) {
    let value = saved[p.key] ?? p.default
    if (value === undefined && p.type === 'secret') {
      value = generated[p.key] = randomBytes(18).toString('base64url')
    }
    if (value === undefined) throw new Error(`${manifest.name}: ${p.label} is not set`)
    values[p.key] = value
  }
  return { values, generated }
}

// Fills ${KEY} placeholders. Ports go in bare and must be numeric; everything
// else is meant to sit inside single quotes in the template, where the only
// escape YAML needs is doubling the quote (backslashes stay literal).
export function render(template: string, manifest: AppManifest, values: Record<string, string>): string {
  const types = new Map(manifest.params.map((p) => [p.key, p.type]))
  return template.replace(/\$\{(\w+)\}/g, (_, key: string) => {
    const value = values[key]
    if (value === undefined) throw new Error(`${manifest.id}: pod.yaml uses unknown setting ${key}`)
    const type = types.get(key)
    if (type === 'port') {
      if (!/^\d{1,5}$/.test(value)) throw new Error(`${manifest.id}: ${key} must be a port number`)
      return value
    }
    return (type === 'path' ? toMachinePath(value) : value).replace(/'/g, "''")
  })
}

export function podStatus(pod: PodState | undefined, healthy: boolean): AppStatus {
  if (!pod) return 'stopped'
  if (healthy) return 'healthy'
  if (pod.status === 'Running' || pod.status === 'Degraded') return 'running'
  if (pod.status === 'Created') return 'starting'
  if (pod.status === 'Exited' || pod.status === 'Stopped') return 'stopped'
  return 'error'
}

export function publicView(manifest: AppManifest, values: Record<string, string>, status: AppStatus): AppView {
  const secrets = new Set(manifest.params.filter((p) => p.type === 'secret').map((p) => p.key))
  return {
    manifest,
    status,
    values: Object.fromEntries(Object.entries(values).filter(([k]) => !secrets.has(k))),
  }
}
