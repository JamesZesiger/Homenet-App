// A link that opens a title directly on a streaming service. TMDB has no such
// links, so the title's IMDb id is looked up on Wikidata, which records each
// service's own id for many titles. Coverage is partial, so callers fall back
// to the service's search page for the title name.
import type { MediaType } from './tmdb'

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

const SPARQL = 'https://query.wikidata.org/sparql'
// Wikidata requires a descriptive User-Agent.
const USER_AGENT = 'homeapp/0.1 (self-hosted home media launcher)'

// Per service: the Wikidata property holding its id, and the URL that id
// goes into (each property's formatter URL, P1630). Paramount+ has none.
const WIKIDATA: Record<string, Partial<Record<MediaType, { prop: string; url: string }>>> = {
  netflix: {
    movie: { prop: 'P1874', url: 'https://www.netflix.com/title/{id}' },
    tv: { prop: 'P1874', url: 'https://www.netflix.com/title/{id}' },
  },
  disney: {
    movie: { prop: 'P7595', url: 'https://www.disneyplus.com/movies/wd/{id}' },
    tv: { prop: 'P7596', url: 'https://www.disneyplus.com/series/wp/{id}' },
  },
  hulu: {
    movie: { prop: 'P6466', url: 'https://www.hulu.com/movie/{id}' },
    tv: { prop: 'P6467', url: 'https://www.hulu.com/series/{id}' },
  },
  prime: {
    movie: { prop: 'P8055', url: 'https://www.primevideo.com/detail/{id}' },
    tv: { prop: 'P8055', url: 'https://www.primevideo.com/detail/{id}' },
  },
  max: {
    movie: { prop: 'P8298', url: 'https://play.max.com/{id}' },
    tv: { prop: 'P8298', url: 'https://play.max.com/{id}' },
  },
  crunchyroll: {
    movie: { prop: 'P11330', url: 'https://www.crunchyroll.com/series/{id}' },
    tv: { prop: 'P11330', url: 'https://www.crunchyroll.com/series/{id}' },
  },
}

const IMDB_ID = /^tt\d+$/

export async function wikidataLink(fetcher: Fetch, imdbId: string, service: string, type: MediaType): Promise<string | undefined> {
  const entry = WIKIDATA[service]?.[type]
  if (!entry || !IMDB_ID.test(imdbId)) return undefined
  const query = `SELECT ?sid WHERE { ?item wdt:P345 "${imdbId}" . ?item wdt:${entry.prop} ?sid . } LIMIT 1`
  const res = await fetcher(`${SPARQL}?format=json&query=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
    // Play waits on this; past a few seconds the search page is the better answer.
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) return undefined
  const body = (await res.json()) as { results?: { bindings?: { sid?: { value?: string } }[] } }
  const sid = body.results?.bindings?.[0]?.sid?.value
  return sid ? entry.url.replace('{id}', encodeURIComponent(sid)) : undefined
}
