import { useEffect, useRef, type ReactNode } from 'react'

// A modal layer: the spatial nav keeps focus inside it (aria-modal), and any
// Escape closes it, including the one the controller's B sends. Focus returns
// to wherever it was when the layer opened.
export function Dialog({ className, label, onClose, children }: {
  className: string
  label: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  // Read during the first render, before an autoFocus child takes focus.
  const opener = useRef(document.activeElement as HTMLElement | null)

  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('[autofocus], input, button, a[href]')
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      // Layers stack (a page over the settings drawer); only the top one closes.
      const layers = document.querySelectorAll('[aria-modal="true"]')
      if (e.key === 'Escape' && !e.defaultPrevented && layers[layers.length - 1] === ref.current) close.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener.current?.focus({ preventScroll: true })
    }
  }, [])

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && close.current()}>
      <div ref={ref} className={className} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  )
}
