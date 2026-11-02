import { useState } from 'react'
import type { AppView, ProviderView } from '../../shared/types'
import { Dialog } from './Dialog'
import { SearchIcon } from './Icons'

// Searches the launcher's own tiles for now, and offers each provider's own
// search for the query. The title catalogue (movies, shows, books, photo
// matches) comes with the streamdeck port.
export function SearchModal({ apps, providers, onOpenApp, onClose }: {
  apps: AppView[]
  providers: ProviderView[]
  onOpenApp: (id: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const enabled = providers.filter((p) => p.enabled)
  const appHits = q ? apps.filter((a) => a.manifest.name.toLowerCase().includes(q)) : []
  const providerHits = q ? enabled.filter((p) => p.name.toLowerCase().includes(q)) : []

  const go = (action: () => unknown) => {
    action()
    onClose()
  }

  return (
    <Dialog className="search-modal" label="Search" onClose={onClose}>
      <label className="search-field">
        <SearchIcon />
        <input
          className="search-input"
          autoFocus
          placeholder="Search apps and streaming services"
          aria-label="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {q ? (
        <div className="results">
          {(appHits.length > 0 || providerHits.length > 0) && (
            <section>
              <h3>Apps</h3>
              <div className="result-row">
                {providerHits.map((p) => (
                  <button key={p.id} className="result-card" onClick={() => go(() => window.homeapp.openProvider(p.id))}>
                    <strong>{p.name}</strong>
                    <span>Streaming</span>
                  </button>
                ))}
                {appHits.map((a) => (
                  <button key={a.manifest.id} className="result-card" onClick={() => go(() => onOpenApp(a.manifest.id))}>
                    <strong>{a.manifest.name}</strong>
                    <span>{a.manifest.description}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <section>
            <h3>Search providers for “{query.trim()}”</h3>
            <div className="result-row">
              {enabled.filter((p) => p.canSearch).map((p) => (
                <button key={p.id} className="result-card" onClick={() => go(() => window.homeapp.openProvider(p.id, query.trim()))}>
                  <strong>{p.name}</strong>
                  <span>Search on {p.name}</span>
                </button>
              ))}
            </div>
          </section>
          <p className="empty-note">Movies, shows, books and photo matches are coming with the streamdeck catalogue.</p>
        </div>
      ) : (
        <p className="empty-note">Type to search apps and streaming services.</p>
      )}
    </Dialog>
  )
}
