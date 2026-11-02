// The movie and show catalogue behind search: every popular US title the
// streaming services carry, fetched from TMDB on first start and weekly after,
// merged across services and kept on disk.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { CatalogStatus, TitleDetail, TitleHit } from '../shared/types'
import { normalize, rank } from './rank'
import { IMAGE_BASE, SERVICES, type DiscoverItem, type MediaType, type Tmdb } from './tmdb'

export const REFRESH_AFTER_MS = 7 * 24 * 3600 * 1000
const CONCURRENCY = 4
const FILE_VERSION = 1

export interface Title {
  key: string
  tmdbId: number
  type: MediaType
  name: string
  overview: string
  poster?: string
  backdrop?: string
  year?: number
  voteCount: number
  services: string[]
}

interface Indexed extends Title {
  normalizedName: string
}

const image = (size: string, path?: string | null) => (path ? `${IMAGE_BASE}/${size}${path}` : undefined)

export function toTitle(type: MediaType, item: DiscoverItem, service: string): Title {
  const date = item.release_date || item.first_air_date
  return {
    key: `${type}:${item.id}`,
    tmdbId: item.id,
    type,
    name: item.title ?? item.name ?? '',
    overview: item.overview ?? '',
    poster: item.poster_path ?? undefined,
    backdrop: item.backdrop_path ?? undefined,
    year: date ? Number(date.slice(0, 4)) || undefined : undefined,
    voteCount: item.vote_count ?? 0,
    services: [service],
  }
}

// One entry per title, listing every service that has it. Discover pages can
// repeat a title as popularity shifts while paging, so merging dedupes too.
export function merge(into: Map<string, Title>, title: Title): void {
  const seen = into.get(title.key)
  if (!seen) into.set(title.key, title)
  else if (!seen.services.includes(title.services[0])) seen.services.push(title.services[0])
}

// Fetches every page of every (service, type) with a few requests in flight,
// reporting pages done out of pages known so far.
export async function fetchCatalog(tmdb: Tmdb, onProgress: (done: number, total: number) => void): Promise<Title[]> {
  const titles = new Map<string, Title>()
  const queue: { service: string; type: MediaType; page: number }[] = []
  for (const s of SERVICES) for (const type of ['movie', 'tv'] as const) queue.push({ service: s.id, type, page: 1 })
  let total = queue.length
  let done = 0
  let active = 0
  let failed = false
  const worker = async () => {
    // An empty queue isn't the end while other workers are still fetching
    // first pages, which add the rest of their pages to it.
    while (!failed && (queue.length || active)) {
      const job = queue.shift()
      if (!job) {
        await new Promise((r) => setTimeout(r, 25))
        continue
      }
      active++
      try {
        const { items, totalPages } = await tmdb.discover(job)
        for (const item of items) if (item.title ?? item.name) merge(titles, toTitle(job.type, item, job.service))
        if (job.page === 1) {
          for (let page = 2; page <= totalPages; page++) queue.push({ ...job, page })
          total += Math.max(0, totalPages - 1)
        }
        onProgress(++done, total)
      } catch (err) {
        failed = true
        throw err
      } finally {
        active--
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return [...titles.values()]
}

export class TitleStore {
  private titles: Indexed[] = []
  private byKey = new Map<string, Indexed>()
  private updatedAt = 0
  private links: Record<string, string> = {}
  status: CatalogStatus = { state: 'idle', titles: 0 }

  constructor(private readonly file: string, private readonly linksFile: string) {
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8')) as { version: number; updatedAt: number; titles: Title[] }
      if (saved.version === FILE_VERSION) this.replace(saved.titles, saved.updatedAt)
    } catch {
      // first start: nothing saved yet
    }
    try {
      this.links = JSON.parse(readFileSync(linksFile, 'utf8')) as Record<string, string>
    } catch {
      this.links = {}
    }
  }

  private replace(titles: Title[], updatedAt: number) {
    this.titles = titles.map((t) => ({ ...t, normalizedName: normalize(t.name) }))
    this.byKey = new Map(this.titles.map((t) => [t.key, t]))
    this.updatedAt = updatedAt
    this.status = { state: 'ready', titles: titles.length, updatedAt }
  }

  needsRefresh(now = Date.now()): boolean {
    return now - this.updatedAt > REFRESH_AFTER_MS
  }

  // Builds a fresh catalogue; the old one keeps serving searches until the
  // new one is complete, and stays if the refresh fails.
  async refresh(tmdb: Tmdb, onStatus: (status: CatalogStatus) => void): Promise<void> {
    if (this.status.state === 'loading') return
    const report = (status: CatalogStatus) => {
      this.status = status
      onStatus(status)
    }
    report({ state: 'loading', titles: this.titles.length, updatedAt: this.updatedAt || undefined, done: 0, total: 0 })
    try {
      const titles = await fetchCatalog(tmdb, (done, total) =>
        report({ ...this.status, state: 'loading', done, total }))
      const updatedAt = Date.now()
      writeAtomic(this.file, JSON.stringify({ version: FILE_VERSION, updatedAt, titles }))
      this.replace(titles, updatedAt)
      report(this.status)
    } catch (err) {
      report({
        state: 'error',
        titles: this.titles.length,
        updatedAt: this.updatedAt || undefined,
        error: (err as Error).message,
      })
    }
  }

  search(query: string, limit = 60): TitleHit[] {
    return rank(query, this.titles, limit).map(hit)
  }

  get(key: string): TitleDetail | undefined {
    const t = this.byKey.get(key)
    return t && { ...hit(t), overview: t.overview, backdrop: image('w1280', t.backdrop) }
  }

  find(key: string): Title | undefined {
    return this.byKey.get(key)
  }

  link(key: string, service: string): string | undefined {
    return this.links[`${key}@${service}`]
  }

  saveLink(key: string, service: string, url: string): void {
    this.links[`${key}@${service}`] = url
    writeAtomic(this.linksFile, JSON.stringify(this.links))
  }
}

function hit(t: Title): TitleHit {
  return { key: t.key, name: t.name, type: t.type, year: t.year, poster: image('w342', t.poster), services: t.services }
}

function writeAtomic(file: string, data: string) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(`${file}.tmp`, data)
  renameSync(`${file}.tmp`, file)
}
