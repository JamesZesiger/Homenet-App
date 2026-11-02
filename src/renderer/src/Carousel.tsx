import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from './Icons'

// Prev/next arrows are focusable buttons so the controller can page through;
// the dots only show position.
export function Carousel({ slides, label, autoAdvanceMs }: { slides: ReactNode[]; label: string; autoAdvanceMs?: number }) {
  const [index, setIndex] = useState(0)
  const count = slides.length
  const current = count ? index % count : 0

  useEffect(() => {
    if (!autoAdvanceMs || count < 2) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), autoAdvanceMs)
    return () => clearInterval(timer)
  }, [autoAdvanceMs, count, index])

  const step = (delta: number) => setIndex((current + delta + count) % count)

  return (
    <div className="carousel" aria-roledescription="carousel" aria-label={label}>
      {count > 1 && <button className="arrow prev" aria-label={`Previous ${label}`} onClick={() => step(-1)}><ChevronLeft /></button>}
      <div className="slide">{slides[current]}</div>
      {count > 1 && <button className="arrow next" aria-label={`Next ${label}`} onClick={() => step(1)}><ChevronRight /></button>}
      {count > 1 && (
        <div className="dots" aria-hidden>
          {slides.map((_, i) => <span key={i} className={i === current ? 'on' : ''} />)}
        </div>
      )}
    </div>
  )
}
