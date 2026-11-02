import type { ReactNode } from 'react'
import { Dialog } from './Dialog'
import { ChevronLeft } from './Icons'

// A full-screen page opened from settings. Back (button, Esc or B) returns to
// the settings drawer underneath.
export function Page({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <Dialog className="page" label={title} onClose={onBack}>
      <header className="page-header">
        <button className="icon-button" aria-label="Back to settings" onClick={onBack}><ChevronLeft /></button>
        <h2>{title}</h2>
      </header>
      <div className="page-body">{children}</div>
    </Dialog>
  )
}
