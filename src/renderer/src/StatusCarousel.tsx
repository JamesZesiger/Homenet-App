import type { AppView } from '../../shared/types'
import { Carousel } from './Carousel'
import { formatBytes, isUp } from './format'
import { Sparkline } from './Sparkline'
import { StatusChip } from './StatusChip'

// One stat tile per running app: CPU now (the hero figure), memory, and the
// last few minutes of CPU as a sparkline.
export function StatusCarousel({ apps }: { apps: AppView[] }) {
  const running = apps.filter((a) => isUp(a.status))
  if (!running.length) {
    return (
      <div className="panel status-panel">
        <h2 className="panel-title">System</h2>
        <p className="empty-note">No apps running. Start one from the row above.</p>
      </div>
    )
  }
  const slides = running.map((a) => {
    const latest = a.stats[a.stats.length - 1]
    return (
      <div className="stat-tile" key={a.manifest.id}>
        <div className="stat-head">
          <h3>{a.manifest.name}</h3>
          <StatusChip status={a.status} />
        </div>
        <div className="stat-body">
          <div className="stat-figures">
            <span className="hero">{latest ? `${latest.cpuPercent.toFixed(1)}%` : '—'}</span>
            <span className="caption">CPU</span>
            <span className="value">{latest ? formatBytes(latest.memBytes) : '—'}</span>
            <span className="caption">Memory</span>
          </div>
          <Sparkline samples={a.stats} />
        </div>
      </div>
    )
  })
  return (
    <div className="panel status-panel">
      <h2 className="panel-title">System</h2>
      <Carousel slides={slides} label="app status" />
    </div>
  )
}
