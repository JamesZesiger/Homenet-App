// Encrypted secret store: streaming logins and API keys. Values are encrypted
// with Electron's safeStorage (DPAPI on Windows, the keychain/secret service
// elsewhere) and only ever decrypted in the main process.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface Cipher {
  encrypt(plain: string): Buffer
  decrypt(encrypted: Buffer): string
}

export interface Login {
  username: string
  password: string
}

export class Vault {
  private data: Record<string, string>

  constructor(private readonly file: string, private readonly cipher: Cipher) {
    try {
      this.data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>
    } catch {
      this.data = {}
    }
  }

  get(key: string): string | undefined {
    const stored = this.data[key]
    return stored === undefined ? undefined : this.cipher.decrypt(Buffer.from(stored, 'base64'))
  }

  set(key: string, value: string): void {
    this.data[key] = this.cipher.encrypt(value).toString('base64')
    this.save()
  }

  delete(key: string): void {
    delete this.data[key]
    this.save()
  }

  getLogin(providerId: string): Login | undefined {
    const raw = this.get(`login:${providerId}`)
    return raw === undefined ? undefined : (JSON.parse(raw) as Login)
  }

  setLogin(providerId: string, login: Login): void {
    this.set(`login:${providerId}`, JSON.stringify(login))
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.data, null, 2), { mode: 0o600 })
  }
}
