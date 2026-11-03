import { useState } from 'react'
import type { AppView } from '../../shared/types'
import { Carousel } from './Carousel'
import { formatBytes, isUp } from './format'
import { Sparkline } from './Sparkline'
import { StatusChip } from './StatusChip'

// One stat tile per service, started and stopped from here: CPU now (the hero
// figure), memory, and the last few minutes of CPU as a sparkline.
export function StatusCarousel({ apps }: { apps: AppView[] }) {
  if (!apps.length) {
    return (
      <div className="panel status-panel">
        <h2 className="panel-title">System</h2>
        <p className="empty-note">No services installed.</p>
      </div>
    )
  }
  return (
    <div className="panel status-panel">
      <h2 className="panel-title">System</h2>
      <Carousel slides={apps.map((a) => <ServiceTile key={a.manifest.id} app={a} />)} label="service" />
    </div>
  )
}

function ServiceTile({ app }: { app: AppView }) {
  const [busy, setBusy] = useState(false)
  const { id, name } = app.manifest
  const up = isUp(app.status)
  const latest = up ? app.stats[app.stats.length - 1] : undefined
  const run = (action: Promise<unknown>) => {
    setBusy(true)
    action.finally(() => setBusy(false))
  }
  return (
    <div className="stat-tile">
      <div className="stat-head">
        <h3>{name}</h3>
        <StatusChip status={app.status} busy={busy} />
        {up
          ? <button type="button" disabled={busy} onClick={() => run(window.homeapp.stop(id))}>Stop</button>
          : <button type="button" disabled={busy || app.status === 'unavailable'} onClick={() => run(window.homeapp.start(id))}>Start</button>}
      </div>
      <div className="stat-body">
        <div className="stat-figures">
          <span className="hero">{latest ? `${latest.cpuPercent.toFixed(1)}%` : '—'}</span>
          <span className="caption">CPU</span>
          <span className="value">{latest ? formatBytes(latest.memBytes) : '—'}</span>
          <span className="caption">Memory</span>
        </div>
        {up && <Sparkline samples={app.stats} />}
      </div>
    </div>
  )
}
