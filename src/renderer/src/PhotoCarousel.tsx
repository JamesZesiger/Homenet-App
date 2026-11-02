import { useEffect, useState } from 'react'
import type { AppStatus, PhotoResult } from '../../shared/types'
import { Carousel } from './Carousel'

const REFRESH_MS = 10 * 60 * 1000
const ADVANCE_MS = 8000

// Ten random photos from Immich, re-drawn every ten minutes and whenever
// Immich comes up or the API key changes.
export function PhotoCarousel({ immichStatus, keyVersion }: { immichStatus?: AppStatus; keyVersion: number }) {
  const [result, setResult] = useState<PhotoResult>({ photos: [] })
  const healthy = immichStatus === 'healthy'

  useEffect(() => {
    const load = () => window.homeapp.photos().then(setResult)
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [healthy, keyVersion])

  return (
    <div className="panel photo-panel">
      <h2 className="panel-title">Memories</h2>
      {result.photos.length ? (
        <Carousel
          label="photo"
          autoAdvanceMs={ADVANCE_MS}
          slides={result.photos.map((p) => <img key={p.id} src={p.url} alt="" />)}
        />
      ) : (
        <p className="empty-note">{result.reason ?? 'Loading photos…'}</p>
      )}
    </div>
  )
}
