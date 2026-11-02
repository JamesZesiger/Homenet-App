import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Vault, type Cipher } from '../src/main/vault'

// Reversible stand-in for safeStorage.
const cipher: Cipher = {
  encrypt: (plain) => Buffer.from([...Buffer.from(plain)].map((b) => b ^ 0x5a)),
  decrypt: (enc) => Buffer.from([...enc].map((b) => b ^ 0x5a)).toString(),
}

describe('Vault', () => {
  it('round-trips logins through disk without storing them in clear', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'vault-')), 'vault.json')
    new Vault(file, cipher).setLogin('netflix', { username: 'me@example.com', password: 'hunter2' })
    expect(readFileSync(file, 'utf8')).not.toContain('hunter2')
    expect(new Vault(file, cipher).getLogin('netflix')).toEqual({ username: 'me@example.com', password: 'hunter2' })
  })

  it('deletes entries', () => {
    const vault = new Vault(join(mkdtempSync(join(tmpdir(), 'vault-')), 'vault.json'), cipher)
    vault.set('immich:apiKey', 'k')
    vault.delete('immich:apiKey')
    expect(vault.get('immich:apiKey')).toBeUndefined()
  })
})
