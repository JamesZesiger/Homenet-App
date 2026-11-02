import { useState, type ChangeEvent } from 'react'
import type { ProviderInput, ProviderView } from '../../shared/types'
import { Page } from './Page'
import { SearchProvidersSection } from './SearchProvidersSection'
import { TileIcon } from './TileIcon'

const EMPTY: ProviderInput = { name: '', home: '', search: '', color: '#2a78d6' }

// Which services appear on the home row, plus the user's own additions.
export function ProvidersPage({ providers, onChanged, onBack }: {
  providers: ProviderView[]
  onChanged: () => void
  onBack: () => void
}) {
  const toggle = async (p: ProviderView, enabled: boolean) => {
    await window.homeapp.setProviderEnabled(p.id, enabled)
    onChanged()
  }
  const remove = async (p: ProviderView) => {
    await window.homeapp.removeProvider(p.id)
    onChanged()
  }

  return (
    <Page title="Providers" onBack={onBack}>
      <p className="page-intro">Streaming services on your home screen. Add any website that plays in a browser.</p>
      <div className="list">
        {providers.map((p) => (
          <div key={p.id} className="list-row">
            <span className="row-title">
              <TileIcon iconKey={`provider-${p.id}`} name={p.name} />
              <span>
                <strong>{p.name}</strong>
                <span className="row-sub">{new URL(p.home).hostname}{p.custom ? ' · added by you' : ''}</span>
              </span>
            </span>
            <span className="actions">
              <label className="toggle">
                <input type="checkbox" checked={p.enabled} onChange={(e) => toggle(p, e.target.checked)} />
                Show on home
              </label>
              {p.custom && <button type="button" onClick={() => remove(p)}>Remove</button>}
            </span>
          </div>
        ))}
      </div>
      <AddProvider onAdded={onChanged} />
      <SearchProvidersSection />
    </Page>
  )
}

function AddProvider({ onAdded }: { onAdded: () => void }) {
  const [input, setInput] = useState(EMPTY)
  const [error, setError] = useState<string>()
  const set = (key: keyof ProviderInput) => (e: ChangeEvent<HTMLInputElement>) =>
    setInput({ ...input, [key]: e.target.value })

  const submit = async () => {
    const result = await window.homeapp.addProvider(input)
    setError(result.error)
    if (!result.error) {
      setInput(EMPTY)
      onAdded()
    }
  }

  return (
    <form className="setting-group add-provider" onSubmit={(e) => { e.preventDefault(); submit() }}>
      <strong>Add a provider</strong>
      <label className="field">Name<input value={input.name} onChange={set('name')} placeholder="Max" /></label>
      <label className="field">Website<input value={input.home} onChange={set('home')} placeholder="https://play.max.com" /></label>
      <label className="field">
        Search address (optional)
        <input value={input.search} onChange={set('search')} placeholder="https://play.max.com/search?q={q}" />
      </label>
      <p className="hint">Gives the provider a Search on button. Search the site, copy the address, and put {'{q}'} where your words were.</p>
      <label className="field color-field">Tile colour<input type="color" value={input.color} onChange={set('color')} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="submit" disabled={!input.name.trim() || !input.home.trim()}>Add provider</button>
      </div>
    </form>
  )
}
