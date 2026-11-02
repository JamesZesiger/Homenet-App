import { useEffect, useState } from 'react'
import type { ProviderView, VaultStatus } from '../../shared/types'
import { Page } from './Page'
import { TileIcon } from './TileIcon'

// Saved sign-ins for streaming services. Passwords go into the vault and are
// never shown again: the page only knows whether one is saved, and for whom.
export function PasswordsPage({ providers, onChanged, onBack }: {
  providers: ProviderView[]
  onChanged: () => void
  onBack: () => void
}) {
  const [vault, setVault] = useState<VaultStatus | null>(null)
  useEffect(() => {
    window.homeapp.vaultStatus().then(setVault)
  }, [])

  return (
    <Page title="Passwords" onBack={onBack}>
      <p className="page-intro">
        Sign-ins saved here are filled in automatically on each service’s own website.
        {vault?.protected && ' They are encrypted with this computer’s keychain.'}
      </p>
      {vault && !vault.protected && (
        <p className="notice">
          No OS keychain is available ({vault.backend}), so saved passwords are only obfuscated on this machine.
        </p>
      )}
      <div className="card-grid">
        {providers.map((p) => <LoginCard key={p.id} provider={p} onChanged={onChanged} />)}
      </div>
    </Page>
  )
}

function LoginCard({ provider, onChanged }: { provider: ProviderView; onChanged: () => void }) {
  const [username, setUsername] = useState(provider.savedUsername ?? '')
  const [password, setPassword] = useState('')
  const run = async (action: Promise<void>) => {
    await action
    setPassword('')
    onChanged()
  }
  return (
    <form className="setting-group" onSubmit={(e) => {
      e.preventDefault()
      run(window.homeapp.saveLogin(provider.id, username, password))
    }}>
      <div className="setting-head">
        <span className="row-title">
          <TileIcon iconKey={`provider-${provider.id}`} name={provider.name} />
          <strong>{provider.name}</strong>
        </span>
        <span className={`chip ${provider.hasLogin ? 'status-healthy' : ''}`}>
          <span className="dot" aria-hidden />
          {provider.hasLogin ? 'Saved' : 'Not saved'}
        </span>
      </div>
      <input aria-label={`${provider.name} email`} placeholder="Email or username" value={username}
        autoComplete="off" onChange={(e) => setUsername(e.target.value)} />
      <input aria-label={`${provider.name} password`} type="password" autoComplete="off"
        placeholder={provider.hasLogin ? 'Saved — type to replace' : 'Password'}
        value={password} onChange={(e) => setPassword(e.target.value)} />
      <div className="actions">
        <button type="submit" disabled={!username || !password}>{provider.hasLogin ? 'Update' : 'Save'}</button>
        {provider.hasLogin && (
          <button type="button" onClick={() => {
            setUsername('')
            run(window.homeapp.clearLogin(provider.id))
          }}>Remove</button>
        )}
      </div>
    </form>
  )
}
