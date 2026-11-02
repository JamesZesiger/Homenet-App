// Streaming services shown as launcher tiles. They play in-app through the
// castlabs Widevine build, so DRM'd sites open in a hosted view like any app.
// Built-in ones ship here; users add their own through the Providers page.
import type { ProviderInput } from '../shared/types'
import { CustomList } from './files'

export interface Provider {
  id: string
  name: string
  // Brand colour for the tile background.
  color: string
  home: string
  // Search page for a query, with {q} replaced by the encoded query.
  search?: string
  // Hosts (and their subdomains) where this provider's saved login may be
  // filled; a port, when given, must match too.
  domains: string[]
  // Page to find the tile icon on, when home only declares a small one.
  iconPage?: string
  custom?: boolean
}

export const PROVIDERS: Provider[] = [
  {
    id: 'netflix', name: 'Netflix', color: '#e50914',
    home: 'https://www.netflix.com/browse',
    search: 'https://www.netflix.com/search?q={q}',
    domains: ['netflix.com'],
  },
  {
    id: 'disney', name: 'Disney+', color: '#0e47a1',
    home: 'https://www.disneyplus.com/',
    search: 'https://www.disneyplus.com/search?q={q}',
    domains: ['disneyplus.com'],
  },
  {
    id: 'hulu', name: 'Hulu', color: '#1ce783',
    home: 'https://www.hulu.com/hub/home',
    search: 'https://www.hulu.com/search?q={q}',
    domains: ['hulu.com'],
  },
  {
    id: 'prime', name: 'Prime Video', color: '#00a8e1',
    home: 'https://www.amazon.com/gp/video/storefront',
    search: 'https://www.amazon.com/s?i=instant-video&k={q}',
    iconPage: 'https://www.primevideo.com/',
    domains: ['amazon.com', 'primevideo.com'],
  },
  {
    id: 'crunchyroll', name: 'Crunchyroll', color: '#f47521',
    home: 'https://www.crunchyroll.com/',
    search: 'https://www.crunchyroll.com/search?q={q}',
    domains: ['crunchyroll.com'],
  },
  {
    // TMDB and Wikidata still say Max; the service is HBO Max again.
    id: 'max', name: 'HBO Max', color: '#002be7',
    home: 'https://play.hbomax.com/',
    search: 'https://play.hbomax.com/search?q={q}',
    domains: ['hbomax.com', 'max.com'],
  },
  {
    id: 'paramount', name: 'Paramount+', color: '#0064ff',
    home: 'https://www.paramountplus.com/',
    search: 'https://www.paramountplus.com/search/?q={q}',
    domains: ['paramountplus.com'],
  },
  {
    id: 'youtube', name: 'YouTube', color: '#ff0000',
    home: 'https://www.youtube.com/',
    search: 'https://www.youtube.com/results?search_query={q}',
    domains: ['youtube.com', 'google.com'],
  },
]

export function providerUrl(provider: Provider, query?: string): string {
  if (!query || !provider.search) return provider.home
  return provider.search.replace('{q}', encodeURIComponent(query))
}

// The provider whose login belongs on this page, if any. Only https pages on
// the provider's own domains qualify.
export function providerForUrl(url: string, providers: Provider[] = PROVIDERS): Provider | undefined {
  const parsed = URL.parse(url)
  if (parsed?.protocol !== 'https:') return undefined
  // host includes a non-default port, so https://localhost:8443 doesn't
  // also match https://localhost:9443.
  const host = parsed.host
  return providers.find((p) => p.domains.some((d) => host === d || host.endsWith(`.${d}`)))
}

// Checks shared by the forms that add providers and search providers.
export function checkName(value: string): string {
  const name = value.trim()
  if (!name || name.length > 40) throw new Error('Name must be 1 to 40 characters')
  return name
}

// An https address from a form; a search address must have {q} where the
// search words go (URL encodes the braces, so put them back first).
export function webAddress(value: string, label: string, search = false): string {
  const url = URL.parse(value.trim())
  if (!url) throw new Error(`${label} must be a full web address, like https://www.example.com`)
  if (url.protocol !== 'https:') throw new Error(`${label} must start with https://`)
  const href = url.href.replace(/%7Bq%7D/gi, '{q}')
  if (search && !href.includes('{q}')) throw new Error(`${label} must contain {q} where the search words go`)
  return href
}

// "Pokémon: The Movie" -> pokemon-the-movie
export function slug(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function uniqueId(base: string, taken: string[]): string {
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return id
}

// A provider from the Providers page form, checked and filled in. Its login
// may only be filled on the website's own domain (www. dropped) and below.
export function toProvider(input: ProviderInput, taken: string[]): Provider {
  const name = checkName(input.name)
  const home = webAddress(input.home, 'Website')
  const search = input.search?.trim() ? webAddress(input.search, 'Search address', true) : undefined
  const color = /^#[0-9a-f]{6}$/i.test(input.color) ? input.color.toLowerCase() : '#52514e'
  const id = uniqueId(slug(name) || 'provider', taken)
  return { id, name, color, home, search, domains: [new URL(home).host.replace(/^www\./, '')], custom: true }
}

// Built-in providers plus the user's own.
export class ProviderStore {
  private custom: CustomList<Provider>

  constructor(file: string) {
    this.custom = new CustomList(file)
  }

  all(): Provider[] {
    return [...PROVIDERS, ...this.custom.items]
  }

  find(id: string): Provider | undefined {
    return this.all().find((p) => p.id === id)
  }

  add(input: ProviderInput): Provider {
    return this.custom.add(toProvider(input, this.all().map((p) => p.id)))
  }

  // Only the user's own providers can be removed; built-ins can be hidden.
  remove(id: string): boolean {
    return this.custom.remove(id)
  }
}
