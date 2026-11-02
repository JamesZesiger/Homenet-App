import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { AppView, ProviderView } from '../../shared/types'
import { Clock } from './Clock'
import { SearchIcon, SettingsIcon } from './Icons'
import { PhotoCarousel } from './PhotoCarousel'
import { SearchModal } from './SearchModal'
import { AdvancedPage } from './AdvancedPage'
import { PasswordsPage } from './PasswordsPage'
import { ProvidersPage } from './ProvidersPage'
import { SettingsDrawer, type SettingsPage } from './SettingsDrawer'
import { StatusCarousel } from './StatusCarousel'
import { StatusChip } from './StatusChip'
import { TileIcon } from './TileIcon'

type Layer = 'search' | 'settings' | null

export function App() {
  const [apps, setApps] = useState<AppView[]>([])
  const [providers, setProviders] = useState<ProviderView[]>([])
  const [layer, setLayer] = useState<Layer>(null)
  // A page opened from settings, shown over the still-open drawer.
  const [page, setPage] = useState<SettingsPage | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [immichKeyVersion, setImmichKeyVersion] = useState(0)
  const row = useRef<HTMLDivElement>(null)

  const loadProviders = useCallback(() => {
    window.homeapp.providers().then(setProviders)
  }, [])

  useEffect(() => {
    window.homeapp.list().then(setApps)
    loadProviders()
    return window.homeapp.onStatus(setApps)
  }, [loadProviders])

  // Controller and keyboard shortcuts, raised by main.tsx.
  useEffect(() => {
    const open = (e: Event) => setLayer((e as CustomEvent<Layer>).detail)
    window.addEventListener('homeapp:layer', open)
    return () => window.removeEventListener('homeapp:layer', open)
  }, [])

  // Cards fade by how much of them is on screen, so the ones running off
  // either end of the row dissolve instead of being sliced off.
  useEffect(() => {
    const el = row.current
    if (!el) return
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        (entry.target as HTMLElement).style.setProperty('--seen', entry.intersectionRatio.toFixed(2))
      }
    }, { root: el, threshold: Array.from({ length: 21 }, (_, i) => i / 20) })
    el.querySelectorAll('.tile').forEach((tile) => observer.observe(tile))
    // The row only scrolls sideways, so a mouse wheel scrolls it sideways.
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      e.preventDefault()
      el.scrollBy({ left: e.deltaY })
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      observer.disconnect()
      el.removeEventListener('wheel', wheel)
    }
  }, [providers, apps.length])

  // Activating an app opens it when it's up, and starts it when it isn't.
  const activateApp = (app: AppView) => {
    const { id } = app.manifest
    if (app.status === 'healthy') {
      window.homeapp.open(id)
    } else if (app.status === 'stopped' || app.status === 'error') {
      setBusy(id)
      window.homeapp.start(id).finally(() => setBusy(null))
    }
  }
  const openApp = (id: string) => {
    const app = apps.find((a) => a.manifest.id === id)
    if (app) activateApp(app)
  }

  const podmanMissing = apps.length > 0 && apps.every((a) => a.status === 'unavailable')

  return (
    <main className="home">
      <header className="topbar">
        <Clock />
        <button className="icon-button" aria-label="Settings" onClick={() => setLayer('settings')}>
          <SettingsIcon />
        </button>
      </header>
      {podmanMissing && (
        <p className="notice">Podman was not found. Install Podman Desktop (Windows) or podman (Linux), then restart homeapp.</p>
      )}

      <section className="panel app-panel" aria-label="Apps">
        <h2 className="panel-title">Apps</h2>
        <div className="app-row" ref={row} data-nav-group>
          <button className="tile search-tile" autoFocus aria-label="Search" onClick={() => setLayer('search')}>
            <SearchIcon />
          </button>
          {providers.filter((p) => p.enabled).map((p) => (
            <button key={p.id} className="tile" aria-label={p.name} title={p.name}
              style={{ '--brand': p.color } as CSSProperties}
              onClick={() => window.homeapp.openProvider(p.id)}>
              <TileIcon iconKey={`provider-${p.id}`} name={p.name} fill />
            </button>
          ))}
          {apps.map((a) => (
            <button key={a.manifest.id} className="tile" disabled={a.status === 'unavailable'}
              aria-label={a.manifest.name} title={a.manifest.name}
              style={{ '--brand': a.manifest.color ?? '#52514e' } as CSSProperties}
              onClick={() => activateApp(a)}>
              <TileIcon iconKey={`app-${a.manifest.id}`} name={a.manifest.name} retry={a.status === 'healthy'} fill />
              <StatusChip status={a.status} busy={busy === a.manifest.id} />
            </button>
          ))}
        </div>
      </section>

      <div className="lower">
        <StatusCarousel apps={apps} />
        <PhotoCarousel immichStatus={apps.find((a) => a.manifest.id === 'immich')?.status} keyVersion={immichKeyVersion} />
      </div>

      {layer === 'search' && (
        <SearchModal apps={apps} providers={providers} onOpenApp={openApp} onClose={() => setLayer(null)} />
      )}
      {layer === 'settings' && (
        <SettingsDrawer
          apps={apps}
          providers={providers}
          onOpenPage={setPage}
          onImmichKeyChanged={() => setImmichKeyVersion((v) => v + 1)}
          onClose={() => {
            setLayer(null)
            setPage(null)
          }}
        />
      )}
      {layer === 'settings' && page === 'passwords' && (
        <PasswordsPage providers={providers} onChanged={loadProviders} onBack={() => setPage(null)} />
      )}
      {layer === 'settings' && page === 'advanced' && (
        <AdvancedPage apps={apps} onBack={() => setPage(null)} />
      )}
      {layer === 'settings' && page === 'providers' && (
        <ProvidersPage providers={providers} onChanged={loadProviders} onBack={() => setPage(null)} />
      )}
    </main>
  )
}
