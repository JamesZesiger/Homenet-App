// TMDB client for the title catalogue: which movies and shows each streaming
// service carries in the US. Availability comes only from TMDB (JustWatch
// data); streaming sites are never scraped.
import { setTimeout as sleep } from 'node:timers/promises'

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

const BASE = 'https://api.themoviedb.org/3'
export const IMAGE_BASE = 'https://image.tmdb.org/t/p'
// TMDB refuses discover pages past 500.
const MAX_PAGES = 500
const TIMEOUT_MS = 10_000
// Longest wait honoured when TMDB asks to slow down.
const MAX_RETRY_WAIT_S = 30

export type MediaType = 'movie' | 'tv'

// The services the catalogue covers, with every TMDB provider id that means
// "streams it" for that service: look providers up by id, never by name (TMDB
// calls Max "HBO Max"), and include ad tiers, which TMDB lists separately.
// Store ids (rent/buy) and Amazon/Apple channels are deliberately absent.
export const SERVICES: { id: string; tmdbProviders: number[]; anyLanguage?: boolean }[] = [
  { id: 'netflix', tmdbProviders: [8, 1796] },
  { id: 'hulu', tmdbProviders: [15] },
  { id: 'disney', tmdbProviders: [337] },
  { id: 'prime', tmdbProviders: [9, 2100] },
  // Nearly all of Crunchyroll is Japanese-original anime, so the English-only
  // rule would empty it; its titles still come with English names and text.
  { id: 'crunchyroll', tmdbProviders: [283], anyLanguage: true },
  { id: 'max', tmdbProviders: [1899] },
  { id: 'paramount', tmdbProviders: [2303, 2616] },
]

// "Popular only": titles with at least this many TMDB votes.
const MIN_VOTES = 50

export interface DiscoverItem {
  id: number
  title?: string
  name?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  release_date?: string
  first_air_date?: string
  vote_count?: number
}

export interface DiscoverQuery {
  service: string
  type: MediaType
  page: number
}

export class Tmdb {
  constructor(private readonly key: string, private readonly fetcher: Fetch) {}

  // A v4 read access token (a long JWT) goes in a header; a v3 key in the URL.
  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${BASE}${path}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    const bearer = this.key.length > 40
    if (!bearer) url.searchParams.set('api_key', this.key)
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetcher(url.href, {
        headers: bearer ? { Authorization: `Bearer ${this.key}` } : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (res.status === 429 && attempt < 5) {
        const wait = Math.min(Number(res.headers.get('retry-after')) || 2 ** attempt, MAX_RETRY_WAIT_S)
        await sleep(wait * 1000)
        continue
      }
      if (res.status === 401) throw new Error('TMDB rejected the API key')
      if (!res.ok) throw new Error(`TMDB returned ${res.status} for ${path}`)
      return (await res.json()) as T
    }
  }

  async discover({ service, type, page }: DiscoverQuery): Promise<{ items: DiscoverItem[]; totalPages: number }> {
    // Jobs only ever come from SERVICES.
    const def = SERVICES.find((s) => s.id === service)!
    const params: Record<string, string> = {
      with_watch_providers: def.tmdbProviders.join('|'),
      watch_region: 'US',
      with_watch_monetization_types: 'flatrate|free|ads',
      'vote_count.gte': String(MIN_VOTES),
      sort_by: 'popularity.desc',
      language: 'en-US',
      include_adult: 'false',
      page: String(page),
    }
    if (!def.anyLanguage) params.with_original_language = 'en'
    const body = await this.get<{ results: DiscoverItem[]; total_pages: number }>(`/discover/${type}`, params)
    return { items: body.results ?? [], totalPages: Math.min(body.total_pages ?? 0, MAX_PAGES) }
  }

  async imdbId(type: MediaType, id: number): Promise<string | undefined> {
    const body = await this.get<{ imdb_id?: string | null }>(`/${type}/${id}/external_ids`)
    return body.imdb_id || undefined
  }
}
