import { useEffect, useState } from 'react'
import type { AppView, CatalogStatus, ProviderView, SearchProviderView, TitleHit } from '../../shared/types'
import { Dialog } from './Dialog'
import { percent } from './format'
import { SearchIcon } from './Icons'
import { TitleDetailDialog } from './TitleDetail'

const DEBOUNCE_MS = 150

// Search across the movie and show catalogue (ranked by how closely the name
// matches), the launcher's own apps, and — pinned on top while typing — the
// user's "Search on …" buttons for sites that search themselves.
export function SearchModal({ apps, providers, onOpenApp, onClose }: {
  apps: AppView[]
  providers: ProviderView[]
  onOpenApp: (app: AppView) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<TitleHit[]>([])
  const [searchOn, setSearchOn] = useState<SearchProviderView[]>([])
  const [status, setStatus] = useState<CatalogStatus>()
  const [open, setOpen] = useState<string | null>(null)
  const q = query.trim()

  useEffect(() => {
    window.homeapp.searchProviders().then((list) => setSearchOn(list.filter((p) => p.enabled)))
    window.homeapp.catalogStatus().then(setStatus)
    return window.homeapp.onCatalogStatus(setStatus)
  }, [])

  useEffect(() => {
    if (!q) {
      setHits([])
      return
    }
    const timer = setTimeout(() => window.homeapp.searchTitles(q).then(setHits), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [q, status?.titles])

  const lower = q.toLowerCase()
  const enabled = providers.filter((p) => p.enabled)
  const appHits = lower ? apps.filter((a) => a.manifest.name.toLowerCase().includes(lower)) : []
  const providerHits = lower ? enabled.filter((p) => p.name.toLowerCase().includes(lower)) : []
  const names = new Map(providers.map((p) => [p.id, p.name]))

  const go = (action: () => unknown) => {
    action()
    onClose()
  }

  return (
    <Dialog className="search-modal" label="Search" onClose={onClose}>
      <div className="search-top">
        <label className="search-field">
          <SearchIcon />
          <input
            className="search-input"
            autoFocus
            placeholder="Search movies, shows and apps"
            aria-label="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {q && searchOn.length > 0 && (
          <div className="search-on" aria-label="Search on other sites">
            <span className="hint">Search on</span>
            {searchOn.map((p) => (
              <button key={p.id} className="pill" onClick={() => go(() => window.homeapp.openSearchProvider(p.id, q))}>
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

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
                  <button key={a.manifest.id} className="result-card" onClick={() => go(() => onOpenApp(a))}>
                    <strong>{a.manifest.name}</strong>
                    <span>{a.manifest.description}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {hits.length > 0 && (
            <section>
              <h3>Movies &amp; shows</h3>
              <div className="poster-grid" data-nav-group>
                {hits.map((t) => (
                  <button key={t.key} className="poster" aria-label={`${t.name}${t.year ? `, ${t.year}` : ''}`}
                    title={t.name} onClick={() => setOpen(t.key)}>
                    <Poster src={t.poster} name={t.name} />
                  </button>
                ))}
              </div>
            </section>
          )}
          {hits.length === 0 && appHits.length === 0 && providerHits.length === 0 && status?.state === 'ready' && (
            <p className="empty-note">Nothing matches “{q}”. Try the Search on buttons above.</p>
          )}
        </div>
      ) : (
        <p className="empty-note">Type to search {status?.titles ? `${status.titles.toLocaleString()} movies and shows` : 'apps and streaming services'}.</p>
      )}
      <CatalogNote status={status} />

      {open && <TitleDetailDialog titleKey={open} names={names} onClose={() => setOpen(null)} onPlayed={onClose} />}
    </Dialog>
  )
}

// The poster, or the name when there is none or it fails to load (offline).
function Poster({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <span className="poster-name">{name}</span>
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
}

// Why movies and shows might be missing or incomplete right now.
function CatalogNote({ status }: { status?: CatalogStatus }) {
  if (!status) return null
  if (status.state === 'no-key') {
    return <p className="hint catalog-note">Add a TMDB API key in Settings › Advanced to search movies and shows.</p>
  }
  if (status.state === 'loading') {
    return <p className="hint catalog-note">Loading the movie and show catalogue… {percent(status)}%</p>
  }
  if (status.state === 'error') return <p className="hint catalog-note">Catalogue update failed: {status.error}</p>
  return null
}
