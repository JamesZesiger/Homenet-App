import { useEffect, useState, type ChangeEvent } from 'react'
import type { QueryFormat, SearchProviderInput, SearchProviderView } from '../../shared/types'

const FORMATS: { value: QueryFormat; label: string; example: string }[] = [
  { value: 'encoded', label: 'Spaces as %20', example: 'the%20office' },
  { value: 'plus', label: 'Spaces as +', example: 'the+office' },
  { value: 'dash', label: 'Words joined with -', example: 'the-office' },
]
const EMPTY: SearchProviderInput = { name: '', url: '', format: 'encoded' }

// The "Search on …" buttons shown above search results: which appear, and the
// user's own sites.
export function SearchProvidersSection() {
  const [list, setList] = useState<SearchProviderView[]>([])
  const load = () => {
    window.homeapp.searchProviders().then(setList)
  }
  useEffect(load, [])

  return (
    <>
      <h3 className="section-title">Search providers</h3>
      <p className="page-intro">Buttons above search results that search another site for what you typed.</p>
      <div className="list">
        {list.map((p) => (
          <div key={p.id} className="list-row">
            <span>
              <strong>{p.name}</strong>
              <span className="row-sub">{new URL(p.url).hostname} · {FORMATS.find((f) => f.value === p.format)?.label}{p.custom ? ' · added by you' : ''}</span>
            </span>
            <span className="actions">
              <label className="toggle">
                <input type="checkbox" checked={p.enabled}
                  onChange={(e) => window.homeapp.setSearchProviderEnabled(p.id, e.target.checked).then(load)} />
                Show button
              </label>
              {p.custom && <button type="button" onClick={() => window.homeapp.removeSearchProvider(p.id).then(load)}>Remove</button>}
            </span>
          </div>
        ))}
      </div>
      <AddSearchProvider onAdded={load} />
    </>
  )
}

function AddSearchProvider({ onAdded }: { onAdded: () => void }) {
  const [input, setInput] = useState(EMPTY)
  const [error, setError] = useState<string>()
  const set = (key: keyof SearchProviderInput) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setInput({ ...input, [key]: e.target.value })

  const submit = async () => {
    const result = await window.homeapp.addSearchProvider(input)
    setError(result.error)
    if (!result.error) {
      setInput(EMPTY)
      onAdded()
    }
  }

  return (
    <form className="setting-group add-provider" onSubmit={(e) => { e.preventDefault(); submit() }}>
      <strong>Add a search provider</strong>
      <label className="field">Name<input value={input.name} onChange={set('name')} placeholder="JustWatch" /></label>
      <label className="field">
        Search address
        <input value={input.url} onChange={set('url')} placeholder="https://www.justwatch.com/us/search?q={q}" />
      </label>
      <p className="hint">Search for anything on the site, copy the address, and put {'{q}'} where your search words were.</p>
      <label className="field">
        Search words are written
        <select value={input.format} onChange={set('format')}>
          {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label} — {f.example}</option>)}
        </select>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="submit" disabled={!input.name.trim() || !input.url.trim()}>Add search provider</button>
      </div>
    </form>
  )
}
