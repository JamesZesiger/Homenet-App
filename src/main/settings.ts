// Per-app setting values, kept as JSON in Electron's userData directory.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

type Settings = Record<string, Record<string, string>>

export class SettingsStore {
  private data: Settings

  constructor(private readonly file: string) {
    try {
      this.data = JSON.parse(readFileSync(file, 'utf8')) as Settings
    } catch {
      this.data = {}
    }
  }

  get(id: string): Record<string, string> {
    return this.data[id] ?? {}
  }

  set(id: string, values: Record<string, string>): void {
    this.data[id] = { ...this.get(id), ...values }
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.data, null, 2), { mode: 0o600 })
  }
}
