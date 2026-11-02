// Encrypted secret store: streaming logins and API keys. Values are encrypted
// with Electron's safeStorage (DPAPI on Windows, the keychain/secret service
// elsewhere) and only ever decrypted in the main process.
import { readJson, writeAtomic } from './files'

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
    this.data = readJson<Record<string, string>>(file, {})
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
    writeAtomic(this.file, JSON.stringify(this.data, null, 2), 0o600)
  }
}
