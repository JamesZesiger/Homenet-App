// Thin wrapper over the podman CLI. The CLI rather than the REST socket because
// it behaves the same on Linux and on Windows, where podman.exe forwards to the
// WSL2 podman machine, so there is no unix-socket/named-pipe client to keep.
import { execFile } from 'node:child_process'

export interface PodState {
  name: string
  status: string
  // Container name -> status, infra container excluded.
  containers: Record<string, string>
}

function run(args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile('podman', args, { maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message))
      else resolve(stdout)
    })
    if (input !== undefined) child.stdin?.end(input)
  })
}

export async function available(): Promise<boolean> {
  try {
    await run(['version', '--format', 'json'])
    return true
  } catch {
    return false
  }
}

// Creates (or recreates) the pod and its named volumes from Kubernetes YAML.
// Volumes survive --replace and down, so app data is never deleted here.
export async function playKube(yaml: string): Promise<void> {
  await run(['kube', 'play', '--replace', '-'], yaml)
}

export async function downKube(yaml: string): Promise<void> {
  await run(['kube', 'down', '-'], yaml)
}

interface RawPod {
  Name: string
  Status: string
  InfraId?: string
  Containers?: { Id: string; Names: string; Status: string }[]
}

export function parsePods(json: string): PodState[] {
  const raw = JSON.parse(json || '[]') as RawPod[] | null
  return (raw ?? []).map((pod) => ({
    name: pod.Name,
    status: pod.Status,
    containers: Object.fromEntries(
      (pod.Containers ?? []).filter((c) => c.Id !== pod.InfraId).map((c) => [c.Names, c.Status]),
    ),
  }))
}

export async function listPods(): Promise<PodState[]> {
  return parsePods(await run(['pod', 'ps', '--format', 'json']))
}

export interface ContainerStats {
  name: string
  cpuPercent: number
  memBytes: number
}

const UNITS: Record<string, number> = {
  b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4,
}

// "12.3MB" -> bytes. podman prints decimal units; binary ones are accepted too.
export function parseSize(text: string): number {
  const m = /^([\d.]+)\s*([a-z]+)$/i.exec(text.trim())
  return m ? Math.round(Number(m[1]) * (UNITS[m[2].toLowerCase()] ?? NaN)) : NaN
}

interface RawStats {
  name: string
  cpu_percent: string
  mem_usage: string
}

export function parseStats(json: string): ContainerStats[] {
  const raw = JSON.parse(json || '[]') as RawStats[] | null
  return (raw ?? []).map((s) => ({
    name: s.name,
    cpuPercent: parseFloat(s.cpu_percent) || 0,
    memBytes: parseSize(s.mem_usage.split('/')[0]) || 0,
  }))
}

export async function stats(): Promise<ContainerStats[]> {
  return parseStats(await run(['stats', '--no-stream', '--format', 'json']))
}
