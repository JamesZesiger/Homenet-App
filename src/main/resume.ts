// Brings the apps back after the computer restarts: Podman's VM and rootless
// pods don't come back on their own, so on launch homeapp starts Podman if
// needed and restarts every app the user left running. Which apps those are
// is the user's intent (started and not since stopped), not a snapshot of
// what happened to be up.
import type { PodState } from './podman'

export interface ResumeDeps {
  available(): Promise<boolean>
  startMachine(): Promise<boolean>
  listPods(): Promise<PodState[]>
  start(id: string): Promise<void>
  podName(id: string): string
  onPodmanStarting(starting: boolean): void
}

// Apps the user wants running whose pod isn't up.
export function appsToResume(wanted: string[], pods: PodState[], podName: (id: string) => string): string[] {
  return wanted.filter((id) => {
    const pod = pods.find((p) => p.name === podName(id))
    return !pod || !(pod.status === 'Running' || pod.status === 'Degraded')
  })
}

export async function resume(wanted: string[], deps: ResumeDeps): Promise<string[]> {
  if (!wanted.length) return []
  if (!(await deps.available())) {
    deps.onPodmanStarting(true)
    const up = await deps.startMachine()
    deps.onPodmanStarting(false)
    if (!up) return []
  }
  const ids = appsToResume(wanted, await deps.listPods(), deps.podName)
  // One at a time: starting several big pods at once on a mini PC just makes
  // all of them slow.
  for (const id of ids) await deps.start(id)
  return ids
}
