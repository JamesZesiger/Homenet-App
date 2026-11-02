import { describe, expect, it } from 'vitest'
import { parsePods } from '../src/main/podman'

describe('parsePods', () => {
  it('reads pod ps JSON and drops the infra container', () => {
    const json = JSON.stringify([{
      Name: 'homeapp-immich',
      Status: 'Running',
      InfraId: 'infra1',
      Containers: [
        { Id: 'infra1', Names: 'abc-infra', Status: 'running' },
        { Id: 'c2', Names: 'homeapp-immich-server', Status: 'running' },
      ],
    }])
    expect(parsePods(json)).toEqual([
      { name: 'homeapp-immich', status: 'Running', containers: { 'homeapp-immich-server': 'running' } },
    ])
  })

  it('handles no pods', () => {
    expect(parsePods('')).toEqual([])
    expect(parsePods('null')).toEqual([])
  })
})
