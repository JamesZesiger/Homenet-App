import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROVIDERS, ProviderStore, providerForUrl, providerUrl, toProvider } from '../src/main/providers'

const netflix = PROVIDERS.find((p) => p.id === 'netflix')!

describe('providerForUrl', () => {
  it('matches a provider domain and its subdomains', () => {
    expect(providerForUrl('https://www.netflix.com/login')?.id).toBe('netflix')
    expect(providerForUrl('https://auth.hulu.com/web/login')?.id).toBe('hulu')
    expect(providerForUrl('https://www.primevideo.com/')?.id).toBe('prime')
  })

  it('refuses look-alike hosts, plain http and junk', () => {
    expect(providerForUrl('https://netflix.com.evil.example/login')).toBeUndefined()
    expect(providerForUrl('https://evilnetflix.com/login')).toBeUndefined()
    expect(providerForUrl('http://www.netflix.com/login')).toBeUndefined()
    expect(providerForUrl('not a url')).toBeUndefined()
  })
})

describe('providerUrl', () => {
  it('opens home without a query and encodes a search query', () => {
    expect(providerUrl(netflix)).toBe(netflix.home)
    expect(providerUrl(netflix, 'tom & jerry')).toBe('https://www.netflix.com/search?q=tom%20%26%20jerry')
  })
})

describe('toProvider', () => {
  const input = { name: 'Max', home: 'https://www.max.com/', search: 'https://www.max.com/search?q={q}', color: '#0026FF' }

  it('fills in id, colour and the domain its login may be filled on', () => {
    expect(toProvider(input, [])).toEqual({
      id: 'max', name: 'Max', color: '#0026ff', custom: true,
      home: 'https://www.max.com/', search: 'https://www.max.com/search?q={q}', domains: ['max.com'],
    })
  })

  it('keeps ids unique', () => {
    expect(toProvider(input, ['max', 'max-2']).id).toBe('max-3')
  })

  it('rejects plain http, junk addresses and search addresses without {q}', () => {
    expect(() => toProvider({ ...input, home: 'http://www.max.com' }, [])).toThrow(/https/)
    expect(() => toProvider({ ...input, home: 'max' }, [])).toThrow(/full web address/)
    expect(() => toProvider({ ...input, search: 'https://www.max.com/search' }, [])).toThrow(/\{q\}/)
    expect(() => toProvider({ ...input, name: ' ' }, [])).toThrow(/Name/)
  })

  it('never lets a custom provider take a built-in provider\'s login', () => {
    const lookalike = toProvider({ ...input, name: 'Not Netflix', home: 'https://www.netflix.com/' }, [])
    expect(providerForUrl('https://www.netflix.com/login', [...PROVIDERS, lookalike])?.id).toBe('netflix')
  })
})

describe('ProviderStore', () => {
  it('saves custom providers and only removes those', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'providers-')), 'providers.json')
    const store = new ProviderStore(file)
    store.add({ name: 'Max', home: 'https://www.max.com/', color: '#000000' })
    expect(new ProviderStore(file).find('max')?.custom).toBe(true)
    expect(store.remove('netflix')).toBe(false)
    expect(store.remove('max')).toBe(true)
    expect(new ProviderStore(file).find('max')).toBeUndefined()
  })
})
