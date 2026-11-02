// "Search on …" buttons above search results. Each streaming provider with a
// search page contributes one; users add their own (JustWatch, Google, …)
// with the address and how the site wants the search words written.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { QueryFormat, SearchProviderInput } from '../shared/types'

export interface SearchProvider {
  id: string
  name: string
  // Address with {q} where the search words go.
  url: string
  format: QueryFormat
  custom?: boolean
}

export const QUERY_FORMATS: QueryFormat[] = ['encoded', 'plus', 'dash']

// How the words go into the address: "tom & jerry" becomes tom%20%26%20jerry,
// tom+%26+jerry, or tom-jerry.
export function formatQuery(query: string, format: QueryFormat): string {
  const words = query.trim()
  if (format === 'plus') return encodeURIComponent(words).replace(/%20/g, '+')
  if (format === 'dash') {
    return words.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }
  return encodeURIComponent(words)
}

export function searchUrl(provider: Pick<SearchProvider, 'url' | 'format'>, query: string): string {
  return provider.url.replace('{q}', formatQuery(query, provider.format))
}

export function toSearchProvider(input: SearchProviderInput, taken: string[]): SearchProvider {
  const name = input.name.trim()
  if (!name || name.length > 40) throw new Error('Name must be 1 to 40 characters')
  let url: URL
  try {
    url = new URL(input.url.trim())
  } catch {
    throw new Error('Address must be a full web address, like https://www.justwatch.com/us/search?q={q}')
  }
  if (url.protocol !== 'https:') throw new Error('Address must start with https://')
  const href = url.href.replace(/%7Bq%7D/gi, '{q}')
  if (!href.includes('{q}')) throw new Error('Address must contain {q} where the search words go')
  if (!QUERY_FORMATS.includes(input.format)) throw new Error('Pick how the search words are written')
  const base = `search-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site'}`
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return { id, name, url: href, format: input.format, custom: true }
}

// The user's own search providers, kept as JSON beside the settings.
export class SearchProviderStore {
  private custom: SearchProvider[]

  constructor(private readonly file: string) {
    try {
      this.custom = (JSON.parse(readFileSync(file, 'utf8')) as SearchProvider[]).map((p) => ({ ...p, custom: true }))
    } catch {
      this.custom = []
    }
  }

  list(): SearchProvider[] {
    return [...this.custom]
  }

  add(input: SearchProviderInput, taken: string[]): SearchProvider {
    const provider = toSearchProvider(input, [...taken, ...this.custom.map((p) => p.id)])
    this.custom.push(provider)
    this.save()
    return provider
  }

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
