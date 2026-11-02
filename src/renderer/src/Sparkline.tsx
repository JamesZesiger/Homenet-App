import type { StatSample } from '../../shared/types'

const W = 300
const H = 80
const PAD = 6

// Single-series CPU line: one hue, 2px stroke, an end marker for "now" and a
// recessive baseline. No legend; the tile's heading names the series.
export function Sparkline({ samples }: { samples: StatSample[] }) {
  if (samples.length < 2) return <div className="sparkline empty">Collecting…</div>
  const max = Math.max(10, ...samples.map((s) => s.cpuPercent)) * 1.15
  const first = samples[0].at
  const span = samples[samples.length - 1].at - first || 1
  const points = samples.map((s) => [
    PAD + ((s.at - first) / span) * (W - PAD * 2),
    H - PAD - (s.cpuPercent / max) * (H - PAD * 2),
  ])
  const [lx, ly] = points[points.length - 1]
  const minutes = Math.max(1, Math.round(span / 60000))
  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
      aria-label={`CPU over the last ${minutes} min, now ${samples[samples.length - 1].cpuPercent.toFixed(1)}%`}>
      <title>{`CPU over the last ${minutes} min`}</title>
      <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} className="baseline" />
      <polyline points={points.map((p) => p.join(',')).join(' ')} className="line" />
      <line x1={lx} y1={ly} x2={lx} y2={ly} className="marker" />
    </svg>
  )
}
