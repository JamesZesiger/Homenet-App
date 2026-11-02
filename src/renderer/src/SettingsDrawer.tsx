import { useEffect, useState } from 'react'
import type { AppView, ProviderView } from '../../shared/types'
import { Dialog } from './Dialog'
import { errorText, isUp } from './format'
import { ChevronRight } from './Icons'
import { StatusChip } from './StatusChip'

export type SettingsPage = 'passwords' | 'providers' | 'advanced'

export function SettingsDrawer({ apps, providers, onOpenPage, onImmichKeyChanged, onClose }: {
  apps: AppView[]
  providers: ProviderView[]
  onOpenPage: (page: SettingsPage) => void
  onImmichKeyChanged: () => void
  onClose: () => void
}) {
  const saved = providers.filter((p) => p.hasLogin).length
  const shown = providers.filter((p) => p.enabled).length

  return (
    <Dialog className="drawer" label="Settings" onClose={onClose}>
      <h2>Settings</h2>

      <div className="nav-list">
        <button className="nav-item" onClick={() => onOpenPage('providers')}>
          <span><strong>Providers</strong><span className="row-sub">{shown} of {providers.length} on home</span></span>
          <ChevronRight />
        </button>
        <button className="nav-item" onClick={() => onOpenPage('passwords')}>
          <span><strong>Passwords</strong><span className="row-sub">{saved} saved</span></span>
          <ChevronRight />
        </button>
      </div>

      <h3>Photos</h3>
      <ImmichKey onChanged={onImmichKeyChanged} />

      <h3>Apps</h3>
      {apps.map((a) => <AppSettings key={a.manifest.id} app={a} />)}

      <div className="nav-list">
        <button className="nav-item" onClick={() => onOpenPage('advanced')}>
          <span><strong>Advanced</strong><span className="row-sub">Catalogue, running apps</span></span>
          <ChevronRight />
        </button>
      </div>
    </Dialog>
  )
}

function ImmichKey({ onChanged }: { onChanged: () => void }) {
  const [hasKey, setHasKey] = useState(false)
  const [key, setKey] = useState('')
  useEffect(() => {
    window.homeapp.hasImmichKey().then(setHasKey)
  }, [])
  const save = async (value: string) => {
    await window.homeapp.setImmichKey(value)
    setKey('')
    setHasKey(!!value)
    onChanged()
  }
  return (
    <form className="setting-group" onSubmit={(e) => { e.preventDefault(); save(key) }}>
      <p className="hint">In Immich: Account settings → API keys → New, with asset read permission.</p>
      <input aria-label="Immich API key" type="password" autoComplete="off"
        placeholder={hasKey ? 'Saved — type to replace' : 'Immich API key'}
        value={key} onChange={(e) => setKey(e.target.value)} />
      <div className="actions">
        <button type="submit" disabled={!key}>Save key</button>
        {hasKey && <button type="button" onClick={() => save('')}>Remove</button>}
      </div>
    </form>
  )
}

function AppSettings({ app }: { app: AppView }) {
  const fields = app.manifest.params.filter((p) => p.type !== 'secret')
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((p) => [p.key, app.values[p.key] ?? ''])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const { id } = app.manifest
  const up = isUp(app.status)
  const run = (action: Promise<void>) => {
    setBusy(true)
    setError(undefined)
    action
      .catch((err) => setError(errorText(err)))
      .finally(() => setBusy(false))
  }
  return (
    <form className="setting-group" onSubmit={(e) => { e.preventDefault(); run(window.homeapp.saveSettings(id, values)) }}>
      <div className="setting-head">
        <strong>{app.manifest.name}</strong>
        <StatusChip status={app.status} busy={busy} />
      </div>
      {(error ?? app.error) && <p className="error" role="alert">{error ?? app.error}</p>}
      {fields.map((p) => (
        <label key={p.key} className="field">
          {p.label}
          <input value={values[p.key]} onChange={(e) => setValues({ ...values, [p.key]: e.target.value })} />
        </label>
      ))}
      <div className="actions">
        <button type="submit" disabled={busy}>Save</button>
        {up
          ? <button type="button" disabled={busy} onClick={() => run(window.homeapp.stop(id))}>Stop</button>
          : <button type="button" disabled={busy || app.status === 'unavailable'} onClick={() => run(window.homeapp.start(id))}>Start</button>}
      </div>
      <p className="hint">Saving restarts the app if it’s running.</p>
    </form>
  )
}
