import { describe, expect, it } from 'vitest'
import { formatQuery, searchUrl, toSearchProvider } from '../src/main/searchProviders'

describe('formatQuery', () => {
  it('writes the words the way the site expects', () => {
    expect(formatQuery('tom & jerry', 'encoded')).toBe('tom%20%26%20jerry')
    expect(formatQuery('tom & jerry', 'plus')).toBe('tom+%26+jerry')
    expect(formatQuery(' Pokémon: The Movie ', 'dash')).toBe('pokemon-the-movie')
  })

  it('fills the address', () => {
    expect(searchUrl({ url: 'https://www.justwatch.com/us/search?q={q}', format: 'plus' }, 'the office'))
      .toBe('https://www.justwatch.com/us/search?q=the+office')
  })
})

describe('toSearchProvider', () => {
  const input = { name: 'JustWatch', url: 'https://www.justwatch.com/us/search?q={q}', format: 'plus' as const }

  it('accepts an https address with {q}', () => {
    expect(toSearchProvider(input, [])).toMatchObject({ id: 'search-justwatch', url: input.url, custom: true })
  })

  it('rejects http, a missing {q} and unknown formats', () => {
    expect(() => toSearchProvider({ ...input, url: 'http://x.test/?q={q}' }, [])).toThrow(/https/)
    expect(() => toSearchProvider({ ...input, url: 'https://x.test/search' }, [])).toThrow(/\{q\}/)
    expect(() => toSearchProvider({ ...input, format: 'weird' as never }, [])).toThrow(/Pick/)
  })
})
