import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// Writes beside the file, then renames over it, so a crash mid-write leaves
// the old copy rather than a truncated one.
export function writeAtomic(file: string, data: string | Uint8Array, mode?: number) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(`${file}.tmp`, data, { mode })
  renameSync(`${file}.tmp`, file)
}

// The saved JSON, or `fallback` when there is none yet (or it won't parse).
export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

// Things the user adds and removes (their own providers), saved as JSON.
export class CustomList<T extends { id: string }> {
  items: T[]

  constructor(private readonly file: string) {
    this.items = readJson<T[]>(file, [])
  }

  add(item: T): T {
    this.items.push(item)
    this.save()
    return item
  }

  remove(id: string): boolean {
    const before = this.items.length
    this.items = this.items.filter((i) => i.id !== id)
    if (this.items.length === before) return false
    this.save()
    return true
  }

  private save() {
    writeAtomic(this.file, JSON.stringify(this.items, null, 2))
  }
}
