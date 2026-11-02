// "Search on …" buttons above search results. Each streaming provider with a
// search page contributes one; users add their own (JustWatch, Google, …)
// with the address and how the site wants the search words written, kept in
// a CustomList.
import type { QueryFormat, SearchProviderInput } from '../shared/types'
import { checkName, slug, uniqueId, webAddress } from './providers'

export interface SearchProvider {
  id: string
  name: string
  // Address with {q} where the search words go.
  url: string
  format: QueryFormat
  custom?: boolean
}

const QUERY_FORMATS: QueryFormat[] = ['encoded', 'plus', 'dash']

// How the words go into the address: "tom & jerry" becomes tom%20%26%20jerry,
// tom+%26+jerry, or tom-jerry.
export function formatQuery(query: string, format: QueryFormat): string {
  const words = query.trim()
  if (format === 'plus') return encodeURIComponent(words).replace(/%20/g, '+')
  if (format === 'dash') return slug(words)
  return encodeURIComponent(words)
}

export function searchUrl(provider: Pick<SearchProvider, 'url' | 'format'>, query: string): string {
  return provider.url.replace('{q}', formatQuery(query, provider.format))
}

export function toSearchProvider(input: SearchProviderInput, taken: string[]): SearchProvider {
  const name = checkName(input.name)
  const url = webAddress(input.url, 'Address', true)
  if (!QUERY_FORMATS.includes(input.format)) throw new Error('Pick how the search words are written')
  return { id: uniqueId(`search-${slug(name) || 'site'}`, taken), name, url, format: input.format, custom: true }
}
