import { useEffect, useState } from 'react'

// The site's or app's icon, served by main. Until one is found (an app that
// has never run, or no network), a letter in the tile's colour. `fill` makes
// it the whole tile rather than a badge.
export function TileIcon({ iconKey, name, retry, fill }: { iconKey: string; name: string; retry?: unknown; fill?: boolean }) {
  const [failed, setFailed] = useState(false)
  // Something changed that may make the icon reachable now (the app came up).
  useEffect(() => setFailed(false), [retry])
  if (failed) return <span className={fill ? 'tile-art monogram-art' : 'tile-icon monogram'} aria-hidden>{name[0]}</span>
  const src = `homeapp-img://icon/${iconKey}?r=${String(retry ?? '')}`
  if (fill) return <img className="tile-art" src={src} alt="" onError={() => setFailed(true)} />
  return (
    <span className="tile-icon favicon" aria-hidden>
      <img src={src} alt="" onError={() => setFailed(true)} />
    </span>
  )
}
