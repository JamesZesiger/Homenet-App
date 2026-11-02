import { describe, expect, it } from 'vitest'
import { parseMachines, type PodState } from '../src/main/podman'
import { appsToResume, resume, type ResumeDeps } from '../src/main/resume'

const pod = (name: string, status: string): PodState => ({ name, status, containers: {} })
const podName = (id: string) => `homeapp-${id}`

describe('parseMachines', () => {
  it('reads podman machine list JSON', () => {
    const json = JSON.stringify([
      { Name: 'other', Running: false, Default: false },
      { Name: 'podman-machine-default*', Running: false, Starting: true, Default: true },
    ])
    expect(parseMachines(json)).toEqual([
      { name: 'other', running: false, isDefault: false },
      { name: 'podman-machine-default', running: true, isDefault: true },
    ])
    expect(parseMachines('')).toEqual([])
  })
})

describe('appsToResume', () => {
  it('picks wanted apps whose pod is missing or not running', () => {
    const pods = [pod('homeapp-immich', 'Running'), pod('homeapp-pihole', 'Exited'), pod('homeapp-abs', 'Degraded')]
    expect(appsToResume(['immich', 'pihole', 'audiobookshelf', 'abs'], pods, podName)).toEqual(['pihole', 'audiobookshelf'])
  })
})

function deps(overrides: Partial<ResumeDeps> & { log: string[] }): ResumeDeps {
  const { log } = overrides
  return {
    available: async () => true,
    startMachine: async () => { log.push('machine'); return true },
    listPods: async () => [],
    start: async (id) => { log.push(`start ${id}`) },
    podName,
    onPodmanStarting: (s) => log.push(`starting=${s}`),
    ...overrides,
  }
}

describe('resume', () => {
  it('starts the Podman machine first when Podman is down, then the apps one by one', async () => {
    const log: string[] = []
    let up = false
    await resume(['immich', 'pihole'], deps({
      log,
      available: async () => up,
      startMachine: async () => { log.push('machine'); up = true; return true },
    }))
    expect(log).toEqual(['starting=true', 'machine', 'starting=false', 'start immich', 'start pihole'])
  })

  it('does nothing when nothing is wanted, and gives up when Podman never comes up', async () => {
    const log: string[] = []
    expect(await resume([], deps({ log }))).toEqual([])
    expect(await resume(['immich'], deps({ log, available: async () => false, startMachine: async () => false }))).toEqual([])
    expect(log).toEqual(['starting=true', 'starting=false'])
  })

  it('leaves apps that are already running alone', async () => {
    const log: string[] = []
    await resume(['immich', 'pihole'], deps({ log, listPods: async () => [pod('homeapp-immich', 'Running')] }))
    expect(log).toEqual(['start pihole'])
  })
})
