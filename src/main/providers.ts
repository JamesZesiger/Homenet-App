// Streaming services shown as launcher tiles. They play in-app through the
// castlabs Widevine build, so DRM'd sites open in a hosted view like any app.
// Built-in ones ship here; users add their own through the Providers page.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ProviderInput } from '../shared/types'

export interface Provider {
  id: string
  name: string
  // Brand colour for the tile background.
  color: string
  home: string
  // Search page for a query, with {q} replaced by the encoded query.
  search?: string
  // Sites (and their subdomains) where this provider's saved login may be filled.
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
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'https:') return undefined
  const host = parsed.hostname
  return providers.find((p) => p.domains.some((d) => host === d || host.endsWith(`.${d}`)))
}

function httpsUrl(value: string, label: string): URL {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error(`${label} must be a full web address, like https://www.example.com`)
  }
  if (url.protocol !== 'https:') throw new Error(`${label} must start with https://`)
  return url
}

// A provider from the Providers page form, checked and filled in. Its login
// may only be filled on the website's own domain (www. dropped) and below.
export function toProvider(input: ProviderInput, taken: string[]): Provider {
  const name = input.name.trim()
  if (!name || name.length > 40) throw new Error('Name must be 1 to 40 characters')
  const home = httpsUrl(input.home, 'Website')
  let search: string | undefined
  if (input.search?.trim()) {
    search = httpsUrl(input.search, 'Search address').href.replace(/%7Bq%7D/gi, '{q}')
    if (!search.includes('{q}')) throw new Error('Search address must contain {q} where the search words go')
  }
  const color = /^#[0-9a-f]{6}$/i.test(input.color) ? input.color.toLowerCase() : '#52514e'
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'provider'
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return { id, name, color, home: home.href, search, domains: [home.hostname.replace(/^www\./, '')], custom: true }
}

// Built-in providers plus the user's own, kept as JSON beside the settings.
export class ProviderStore {
  private custom: Provider[]

  constructor(private readonly file: string) {
    try {
      this.custom = (JSON.parse(readFileSync(file, 'utf8')) as Provider[]).map((p) => ({ ...p, custom: true }))
    } catch {
      this.custom = []
    }
  }

  all(): Provider[] {
    return [...PROVIDERS, ...this.custom]
  }

  find(id: string): Provider | undefined {
    return this.all().find((p) => p.id === id)
  }

  add(input: ProviderInput): Provider {
    const provider = toProvider(input, this.all().map((p) => p.id))
    this.custom.push(provider)
    this.save()
    return provider
  }

  // Only the user's own providers can be removed; built-ins can be hidden.
  remove(id: string): boolean {
    const before = this.custom.length
    this.custom = this.custom.filter((p) => p.id !== id)
    if (this.custom.length === before) return false
    this.save()
    return true
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.custom, null, 2))
  }
}
