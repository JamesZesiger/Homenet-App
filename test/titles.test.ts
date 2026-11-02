import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fetchCatalog, merge, toTitle, TitleStore, type Title } from '../src/main/titles'
import { SERVICES, Tmdb, type DiscoverQuery } from '../src/main/tmdb'

// A TMDB stand-in: every (service, type) has two pages; "Shared" is on all.
function fakeTmdb(calls: DiscoverQuery[] = []) {
  return {
    discover: async (q: DiscoverQuery) => {
      calls.push(q)
      const id = q.page * 1000 + SERVICES.findIndex((s) => s.id === q.service) * 10 + (q.type === 'tv' ? 1 : 0)
      return {
        items: [{ id, title: `${q.service} ${q.type} ${q.page}`, vote_count: 60 }, { id: 1, title: 'Shared', vote_count: 900 }],
        totalPages: 2,
      }
    },
  } as unknown as Tmdb
}

describe('merge', () => {
  it('keeps one entry per title and lists every service', () => {
    const map = new Map<string, Title>()
    merge(map, toTitle('movie', { id: 1, title: 'A' }, 'netflix'))
    merge(map, toTitle('movie', { id: 1, title: 'A' }, 'hulu'))
    merge(map, toTitle('movie', { id: 1, title: 'A' }, 'hulu'))
    merge(map, toTitle('tv', { id: 1, name: 'A' }, 'hulu'))
    expect([...map.values()].map((t) => `${t.key}=${t.services}`)).toEqual(['movie:1=netflix,hulu', 'tv:1=hulu'])
  })
})

describe('fetchCatalog', () => {
  it('fetches every page of every service and type, merging shared titles', async () => {
    const calls: DiscoverQuery[] = []
    let last = [0, 0]
    const titles = await fetchCatalog(fakeTmdb(calls), (done, total) => { last = [done, total] })
    expect(calls).toHaveLength(SERVICES.length * 2 * 2)
    expect(last).toEqual([calls.length, calls.length])
    const shared = titles.filter((t) => t.name === 'Shared')
    expect(shared.map((t) => t.type).sort()).toEqual(['movie', 'tv'])
    expect(shared[0].services).toHaveLength(SERVICES.length)
  })
})

describe('TitleStore', () => {
  it('builds, saves, reloads and searches the catalogue', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'titles-'))
    const store = new TitleStore(join(dir, 'titles.json'), join(dir, 'links.json'))
    expect(store.needsRefresh()).toBe(true)
    const states: string[] = []
    await store.refresh(fakeTmdb(), (s) => states.push(s.state))
    expect(states[0]).toBe('loading')
    expect(states.at(-1)).toBe('ready')

    const reloaded = new TitleStore(join(dir, 'titles.json'), join(dir, 'links.json'))
    expect(reloaded.needsRefresh()).toBe(false)
    expect(reloaded.search('shared')[0]).toMatchObject({ name: 'Shared' })
    expect(reloaded.get('movie:1')?.services).toHaveLength(SERVICES.length)
  })

  it('keeps the old catalogue when a refresh fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'titles-'))
    const store = new TitleStore(join(dir, 'titles.json'), join(dir, 'links.json'))
    await store.refresh(fakeTmdb(), () => {})
    const failing = { discover: async () => { throw new Error('TMDB rejected the API key') } } as unknown as Tmdb
    await store.refresh(failing, () => {})
    expect(store.status).toMatchObject({ state: 'error', error: 'TMDB rejected the API key' })
    expect(store.search('shared')).toHaveLength(2)
  })
})
