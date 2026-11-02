import { useEffect, useRef, useState } from 'react'
import type { AppStatus, AppView } from '../../shared/types'

const STATUS_LABEL: Record<AppStatus, string> = {
  unavailable: 'Podman unavailable',
  stopped: 'Stopped',
  starting: 'Starting',
  running: 'Starting',
  healthy: 'Running',
  error: 'Error',
}

export function App() {
  const [apps, setApps] = useState<AppView[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  useEffect(() => {
    window.homeapp.list().then(setApps)
    return window.homeapp.onStatus(setApps)
  }, [])

  useEffect(() => {
    const back = () => setEditing(null)
    window.addEventListener('homeapp:back', back)
    return () => window.removeEventListener('homeapp:back', back)
  }, [])

  const run = (id: string, action: (id: string) => Promise<void>) => {
    setBusy(id)
    action(id).finally(() => setBusy(null))
  }

  const editApp = apps.find((a) => a.manifest.id === editing)
  if (editApp) return <Settings app={editApp} onDone={() => setEditing(null)} />

  return (
    <main>
      <h1>homeapp</h1>
      {apps.length > 0 && apps.every((a) => a.status === 'unavailable') && (
        <p className="notice">
          Podman was not found. Install Podman Desktop (Windows) or <code>podman</code> (Linux), then restart homeapp.
        </p>
      )}
      <div className="grid">
        {apps.map((a, i) => {
          const { id } = a.manifest
          const up = a.status === 'healthy' || a.status === 'running' || a.status === 'starting'
          return (
            <section key={id} className="card">
              <h2>{a.manifest.name}</h2>
              <p>{a.manifest.description}</p>
              <span className={`chip ${a.status}`}>{busy === id ? 'Working…' : STATUS_LABEL[a.status]}</span>
              {a.error && <p className="error">{a.error}</p>}
              <div className="actions">
                {up ? (
                  <button autoFocus={i === 0} disabled={a.status !== 'healthy'} onClick={() => window.homeapp.open(id)}>Open</button>
                ) : (
                  <button autoFocus={i === 0} disabled={busy === id || a.status === 'unavailable'} onClick={() => run(id, window.homeapp.start)}>Start</button>
                )}
                {up && <button disabled={busy === id} onClick={() => run(id, window.homeapp.stop)}>Stop</button>}
                <button onClick={() => setEditing(id)}>Settings</button>
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}

function Settings({ app, onDone }: { app: AppView; onDone: () => void }) {
  const fields = app.manifest.params.filter((p) => p.type !== 'secret')
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((p) => [p.key, app.values[p.key] ?? ''])))
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => first.current?.focus(), [])

  const save = async () => {
    await window.homeapp.saveSettings(app.manifest.id, values)
    onDone()
  }

  return (
    <main>
      <h1>{app.manifest.name} settings</h1>
      <p>Changes apply the next time the app is started.</p>
      <form className="settings" onSubmit={(e) => { e.preventDefault(); save() }}>
        {fields.map((p, i) => (
          <label key={p.key}>
            {p.label}
            <input
              ref={i === 0 ? first : undefined}
              value={values[p.key]}
              onChange={(e) => setValues({ ...values, [p.key]: e.target.value })}
            />
          </label>
        ))}
        <div className="actions">
          <button type="submit">Save</button>
          <button type="button" onClick={onDone}>Back</button>
        </div>
      </form>
    </main>
  )
}
