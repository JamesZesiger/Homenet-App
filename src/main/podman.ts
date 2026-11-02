// Thin wrapper over the podman CLI. The CLI rather than the REST socket because
// it behaves the same on Linux and on Windows, where podman.exe forwards to the
// WSL2 podman machine, so there is no unix-socket/named-pipe client to keep.
import { execFile } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

export interface PodState {
  name: string
  status: string
}

// Degraded: some of the pod's containers are running.
export const podUp = (pod?: PodState) => pod?.status === 'Running' || pod?.status === 'Degraded'

// Most commands answer in moments; one that hangs (a stuck Podman machine)
// is killed rather than left waiting forever. 0 means no limit, for kube play,
// which may be pulling gigabytes of images.
function run(args: string[], input?: string, timeout = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile('podman', args, { maxBuffer: 16 * 1024 * 1024, timeout }, (err, stdout, stderr) => {
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
  await run(['kube', 'play', '--replace', '-'], yaml, 0)
}

export async function downKube(yaml: string): Promise<void> {
  await run(['kube', 'down', '-'], yaml, 120_000)
}


export function parsePods(json: string): PodState[] {
  const raw = JSON.parse(json || '[]') as { Name: string; Status: string }[] | null
  return (raw ?? []).map((pod) => ({ name: pod.Name, status: pod.Status }))
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

interface MachineState {
  name: string
  running: boolean
  isDefault: boolean
}

interface RawMachine {
  Name: string
  Running?: boolean
  Starting?: boolean
  Default?: boolean
}

export function parseMachines(json: string): MachineState[] {
  const raw = JSON.parse(json || '[]') as RawMachine[] | null
  return (raw ?? []).map((m) => ({
    // The table view marks the default with a trailing *; strip it either way.
    name: m.Name.replace(/\*$/, ''),
    running: !!(m.Running || m.Starting),
    isDefault: !!m.Default,
  }))
}

// Windows and macOS run Podman in a VM ("machine") that is down after the
// computer restarts. Starts the default machine if there is one and it isn't
// running, then waits for Podman to answer. False when there's no machine to
// start (as on Linux, where Podman runs natively) or it doesn't come up.
const MACHINE_TIMEOUT_MS = 120_000

export async function startMachine(): Promise<boolean> {
  let machines: MachineState[]
  try {
    machines = parseMachines(await run(['machine', 'list', '--format', 'json']))
  } catch {
    return false
  }
  const machine = machines.find((m) => m.isDefault) ?? machines[0]
  if (!machine) return false
  if (!machine.running) {
    try {
      await run(['machine', 'start', machine.name], undefined, MACHINE_TIMEOUT_MS)
    } catch {
      // already starting, or failed; the wait below tells which
    }
  }
  for (const end = Date.now() + MACHINE_TIMEOUT_MS; Date.now() < end; await sleep(2000)) {
    if (await available()) return true
  }
  return false
}
