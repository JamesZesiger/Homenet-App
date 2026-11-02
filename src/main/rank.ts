// Ranks titles by how closely their name matches what was typed: an exact
// match, then the name starting with it, a word starting with it, every typed
// word starting a word, the text appearing anywhere, and finally a near miss
// for typos. Vote count only breaks ties within a tier.

// Words that carry no meaning when matching: "the office" should still find
// "Office Space", just below "The Office".
const FILLER = new Set(['the', 'a', 'an', 'and', 'of'])

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Edit distance with adjacent swaps (Damerau, optimal string alignment).
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[a.length][b.length]
}

// 0 when the name doesn't match at all. Both arguments must be normalized.
export function matchScore(query: string, name: string): number {
  if (!query || !name) return 0
  if (name === query) return 100
  if (name.startsWith(query)) return 90
  const words = name.split(' ')
  if (words.some((w) => w.startsWith(query))) return 75
  const all = query.split(' ')
  const tokens = all.filter((t) => !FILLER.has(t)).length ? all.filter((t) => !FILLER.has(t)) : all
  if (all.length > 1 && tokens.every((t) => words.some((w) => w.startsWith(t)))) return 70
  if (name.includes(query)) return 60
  // Typos: compare against the start of the name and each word run of the
  // same length, so "strnger things" still finds "Stranger Things".
  if (query.length < 4) return 0
  let best = Infinity
  const starts = [0, ...[...name.matchAll(/ /g)].map((m) => (m.index ?? 0) + 1)]
  for (const s of starts) {
    for (const len of [query.length - 1, query.length, query.length + 1]) {
      best = Math.min(best, distance(query, name.slice(s, s + len)))
    }
  }
  const similarity = 1 - best / query.length
  return similarity >= 0.75 ? Math.round(50 * similarity) : 0
}

export interface Rankable {
  normalizedName: string
  voteCount: number
}

export function rank<T extends Rankable>(query: string, items: T[], limit: number): T[] {
  const q = normalize(query)
  if (!q) return []
  return items
    .map((item) => ({ item, score: matchScore(q, item.normalizedName) }))
    .filter((r) => r.score > 0)
    .map((r) => ({ ...r, score: r.score + Math.min(4, Math.log10(1 + r.item.voteCount)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.item)
}
