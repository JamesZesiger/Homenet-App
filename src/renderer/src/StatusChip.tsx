import type { AppStatus } from '../../shared/types'
import { STATUS_LABEL } from './format'

// Status always pairs its colour with a text label, never colour alone.
export function StatusChip({ status, busy }: { status: AppStatus; busy?: boolean }) {
  return (
    <span className={`chip status-${status}`}>
      <span className="dot" aria-hidden />
      {busy ? 'Working…' : STATUS_LABEL[status]}
    </span>
  )
}
