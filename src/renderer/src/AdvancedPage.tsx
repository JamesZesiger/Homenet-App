import { useEffect, useState } from 'react'
import type { AppView, CatalogStatus } from '../../shared/types'
import { Page } from './Page'
import { StatusChip } from './StatusChip'

// Things most people never touch: the catalogue's TMDB key and refresh, and
// stopping apps, which otherwise keep running when homeapp closes.
export function AdvancedPage({ apps, onBack }: { apps: AppView[]; onBack: () => void }) {
  const [status, setStatus] = useState<CatalogStatus>()
  const [hasKey, setHasKey] = useState(false)
  const [key, setKey] = useState('')
  const [stopping, setStopping] = useState(false)
  const [keyError, setKeyError] = useState<string>()

  useEffect(() => {
    window.homeapp.catalogStatus().then(setStatus)
    window.homeapp.hasTmdbKey().then(setHasKey)
    return window.homeapp.onCatalogStatus(setStatus)
  }, [])

  const saveKey = async (value: string) => {
    try {
      await window.homeapp.setTmdbKey(value)
      setKeyError(undefined)
      setKey('')
      setHasKey(!!value)
      setStatus(await window.homeapp.catalogStatus())
    } catch (err) {
      setKeyError(`Couldn't save the key: ${(err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`)
    }
  }
  const running = apps.filter((a) => a.status === 'healthy' || a.status === 'running' || a.status === 'starting')

  return (
    <Page title="Advanced" onBack={onBack}>
      <section className="setting-group">
        <strong>Movie &amp; show catalogue</strong>
        <p className="hint">{describe(status)}</p>
        <form className="actions" onSubmit={(e) => { e.preventDefault(); saveKey(key) }}>
          <input aria-label="TMDB API key" type="password" autoComplete="off" value={key}
            placeholder={hasKey ? 'TMDB API key saved — type to replace' : 'TMDB API key'}
            onChange={(e) => setKey(e.target.value)} />
          <button type="submit" disabled={!key}>Save key</button>
          <button type="button" disabled={!hasKey || status?.state === 'loading'} onClick={() => window.homeapp.refreshCatalog()}>
            Refresh now
          </button>
        </form>
        {keyError && <p className="error" role="alert">{keyError}</p>}
        <p className="hint">Get a free key at themoviedb.org → Settings → API. Popular US titles in English are kept, refreshed weekly.</p>
      </section>

      <section className="setting-group">
        <div className="setting-head">
          <strong>Running apps</strong>
          <button type="button" disabled={!running.length || stopping} onClick={async () => {
            setStopping(true)
            await window.homeapp.stopAllApps()
            setStopping(false)
          }}>{stopping ? 'Stopping…' : 'Stop all'}</button>
        </div>
        <p className="hint">Apps keep running when homeapp closes, so phones and other devices can still reach them.</p>
        {running.length === 0 && <p className="hint">No apps are running.</p>}
        <div className="list">
          {running.map((a) => (
            <div key={a.manifest.id} className="list-row">
              <strong>{a.manifest.name}</strong>
              <span className="actions">
                <StatusChip status={a.status} />
                <button type="button" onClick={() => window.homeapp.stop(a.manifest.id)}>Stop</button>
              </span>
            </div>
          ))}
        </div>
      </section>
    </Page>
  )
}

function describe(status?: CatalogStatus): string {
  if (!status) return ''
  const when = status.updatedAt ? `, updated ${new Date(status.updatedAt).toLocaleString()}` : ''
  switch (status.state) {
    case 'no-key': return 'Needs a TMDB API key to download the catalogue.'
    case 'loading': {
      const pct = status.total ? Math.round((100 * (status.done ?? 0)) / status.total) : 0
      return `Downloading… ${pct}% (${status.done ?? 0} of ${status.total ?? '?'} pages)`
    }
    case 'error': return `Last update failed: ${status.error}. ${status.titles.toLocaleString()} titles kept${when}.`
    case 'ready': return `${status.titles.toLocaleString()} movies and shows${when}.`
    default: return 'Not downloaded yet.'
  }
}
