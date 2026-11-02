// Per-app setting values, kept as JSON in Electron's userData directory.
import { readJson, writeAtomic } from './files'

type Settings = Record<string, Record<string, string>>

export class SettingsStore {
  private data: Settings

  constructor(private readonly file: string) {
    this.data = readJson<Settings>(file, {})
  }

  get(id: string): Record<string, string> {
    return this.data[id] ?? {}
  }

  set(id: string, values: Record<string, string>): void {
    this.data[id] = { ...this.get(id), ...values }
    writeAtomic(this.file, JSON.stringify(this.data, null, 2), 0o600)
  }
}
