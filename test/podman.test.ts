import { describe, expect, it } from 'vitest'
import { parsePods, parseSize, parseStats } from '../src/main/podman'

describe('parsePods', () => {
  it('reads pod names and states from pod ps JSON', () => {
    const json = JSON.stringify([{ Name: 'homeapp-immich', Status: 'Running', InfraId: 'infra1', Containers: [] }])
    expect(parsePods(json)).toEqual([{ name: 'homeapp-immich', status: 'Running' }])
  })

  it('handles no pods', () => {
    expect(parsePods('')).toEqual([])
    expect(parsePods('null')).toEqual([])
  })
})

describe('parseStats', () => {
  it('reads podman stats JSON into numbers', () => {
    const json = JSON.stringify([
      { name: 'homeapp-immich-server', cpu_percent: '12.5%', mem_usage: '512.3MB / 16.48GB' },
      { name: 'idle', cpu_percent: '0.00%', mem_usage: '0B / 16.48GB' },
    ])
    expect(parseStats(json)).toEqual([
      { name: 'homeapp-immich-server', cpuPercent: 12.5, memBytes: 512.3e6 },
      { name: 'idle', cpuPercent: 0, memBytes: 0 },
    ])
  })

  it('parses decimal and binary sizes', () => {
    expect(parseSize('1.5GB')).toBe(1.5e9)
    expect(parseSize('2KiB')).toBe(2048)
    expect(parseSize('?')).toBeNaN()
  })
})
