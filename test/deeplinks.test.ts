import { describe, expect, it } from 'vitest'
import { wikidataLink } from '../src/main/deeplinks'

const sparql = (sid?: string) => async () =>
  new Response(JSON.stringify({ results: { bindings: sid ? [{ sid: { value: sid } }] : [] } }))

describe('wikidataLink', () => {
  it('turns the service id Wikidata holds into the service URL', async () => {
    expect(await wikidataLink(sparql('80057281'), 'tt4574334', 'netflix', 'tv')).toBe('https://www.netflix.com/title/80057281')
    expect(await wikidataLink(sparql('abc'), 'tt1', 'hulu', 'movie')).toBe('https://www.hulu.com/movie/abc')
  })

  it('returns nothing when Wikidata has no id, the service has no property, or the IMDb id is malformed', async () => {
    expect(await wikidataLink(sparql(), 'tt1', 'netflix', 'movie')).toBeUndefined()
    expect(await wikidataLink(sparql('x'), 'tt1', 'paramount', 'movie')).toBeUndefined()
    let called = false
    await wikidataLink(async () => { called = true; return new Response('{}') }, 'tt1" } BIND("x', 'netflix', 'movie')
    expect(called).toBe(false)
  })
})
