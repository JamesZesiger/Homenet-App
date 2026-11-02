// Tile icons: the site's or app's own favicon, found from its page's <link>
// tags, fetched once and cached on disk so tiles have them offline and while
// an app is stopped.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type Fetch = (url: string) => Promise<Response>

export interface Candidate {
  href: string
  score: number
}

const attr = (tag: string, name: string) =>
  new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1]

const largest = (sizes: string | undefined) =>
  Math.max(0, ...(sizes ?? '').split(/\s+/).map((s) => (s === 'any' ? 512 : parseInt(s, 10) || 0)))

// Icons a page declares in <link> tags. An apple-touch-icon is at least 180px.
function linkIcons(html: string, pageUrl: string): Candidate[] {
  const found: Candidate[] = []
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attr(tag, 'rel')?.toLowerCase() ?? ''
    const href = attr(tag, 'href')
    if (!href || !/\b(icon|apple-touch-icon)\b/.test(rel) || rel.includes('mask-icon')) continue
    const size = largest(attr(tag, 'sizes'))
    const score = rel.includes('apple-touch-icon') ? Math.max(size, 180) : size || (href.endsWith('.svg') ? 128 : 32)
    found.push({ href: new URL(href, pageUrl).href, score })
  }
  return found
}

// The page's web app manifest, which usually lists 192-512px icons.
export function manifestUrl(html: string, pageUrl: string): string | undefined {
  const tag = (html.match(/<link\b[^>]*>/gi) ?? []).find((t) => attr(t, 'rel')?.toLowerCase() === 'manifest')
  const href = tag && attr(tag, 'href')
  return href ? new URL(href, pageUrl).href : undefined
}

// Monochrome icons are single-colour glyphs meant for OS badges, so they're
// skipped. Maskable ones are drawn to fill their shape edge to edge, so they
// win a tie.
export function manifestIcons(manifest: unknown, url: string): Candidate[] {
  const icons = (manifest as { icons?: { src?: string; sizes?: string; purpose?: string }[] } | null)?.icons
  if (!Array.isArray(icons)) return []
  return icons
    .filter((i) => typeof i.src === 'string' && !i.purpose?.includes('monochrome'))
    .map((i) => ({
      href: new URL(i.src as string, url).href,
      score: largest(i.sizes) + (i.purpose?.includes('maskable') ? 1 : 0),
    }))
}

// Icon URLs best first: the largest declared icon wins, and /favicon.ico is
// the last resort.
export function iconCandidates(html: string, pageUrl: string, extra: Candidate[] = []): string[] {
  const urls = [...linkIcons(html, pageUrl), ...extra].sort((a, b) => b.score - a.score).map((c) => c.href)
  urls.push(new URL('/favicon.ico', pageUrl).href)
  return [...new Set(urls)]
}

export class IconCache {
  constructor(private readonly dir: string, private readonly fetcher: Fetch) {}

  private file(key: string) {
    return join(this.dir, key)
  }

  cached(key: string): { body: Buffer; type: string } | undefined {
    const file = this.file(key)
    if (!existsSync(file)) return undefined
    return { body: readFileSync(file), type: readFileSync(`${file}.type`, 'utf8') }
  }

  forget(key: string): void {
    rmSync(this.file(key), { force: true })
    rmSync(`${this.file(key)}.type`, { force: true })
  }

  // Looks the icon up from `pageUrl` and caches the first one that loads.
  async fetch(key: string, pageUrl: string): Promise<{ body: Buffer; type: string } | undefined> {
    const page = await this.fetcher(pageUrl)
    const html = page.ok ? await page.text() : ''
    const base = page.url || pageUrl
    let extra: Candidate[] = []
    const manifest = manifestUrl(html, base)
    if (manifest) {
      try {
        const res = await this.fetcher(manifest)
        if (res.ok) extra = manifestIcons(await res.json(), res.url || manifest)
      } catch {
        // no manifest icons; the page's own links still count
      }
    }
    for (const url of iconCandidates(html, base, extra)) {
      try {
        const res = await this.fetcher(url)
        const type = res.headers.get('content-type')?.split(';')[0] ?? ''
        if (!res.ok || !type.startsWith('image/')) continue
        const body = Buffer.from(await res.arrayBuffer())
        if (!body.length) continue
        mkdirSync(this.dir, { recursive: true })
        writeFileSync(this.file(key), body)
        writeFileSync(`${this.file(key)}.type`, type)
        return { body, type }
      } catch {
        // try the next candidate
      }
    }
    return undefined
  }
}
