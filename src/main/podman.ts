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
