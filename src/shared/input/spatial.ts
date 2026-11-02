// Spatial navigation, ported from homenet's apps/streamdeck/app/templates/base.html
// and made page-agnostic so the same module drives the launcher and the
// third-party web apps it hosts. Arrows (or the D-pad) move focus to the
// nearest interactive element in that direction; nothing else about the page
// changes, so mouse and keyboard keep working natively.
import type { Intent } from './intents'

export interface Rect { left: number; top: number; right: number; bottom: number }
type Dir = [number, number]

const DIRS: Record<string, Dir> = {
  left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1],
}
const KEY_DIRS: Record<string, Dir> = {
  ArrowLeft: DIRS.left, ArrowRight: DIRS.right, ArrowUp: DIRS.up, ArrowDown: DIRS.down,
}

// Index of the candidate to move to, or -1. With no origin, start at the
// top-left candidate in the viewport.
//
// Edge-based scoring: 'ahead' is how far focus travels (facing edge to facing
// edge) and 'cross' is the gap between the two elements' spans on the other
// axis, zero when they share the arrow's row/column. Same-row/column
// candidates always beat diagonal ones (the tier constant outweighs any
// on-screen distance): walking a toolbar must reach its far end, not drop into
// nearer content below. Center-to-center scoring failed both ways: a
// full-width banner's center is far from an edge column, and a tiny carousel
// dot's center is near everything.
export function pickNext(from: Rect | null, dir: Dir, candidates: Rect[], viewportHeight: number): number {
  let best = Infinity
  let next = -1
  if (!from) {
    candidates.forEach((r, i) => {
      if (r.bottom < 0 || r.top > viewportHeight) return
      const score = r.top * 3 + r.left
      if (score < best) { best = score; next = i }
    })
    return next === -1 && candidates.length ? 0 : next
  }
  candidates.forEach((r, i) => {
    const ahead = dir[0]
      ? (dir[0] > 0 ? r.left - from.right : from.left - r.right)
      : (dir[1] > 0 ? r.top - from.bottom : from.top - r.bottom)
    if (ahead < -6) return // behind or overlapping the origin
    const [lo, hi] = dir[0]
      ? [Math.max(r.top, from.top), Math.min(r.bottom, from.bottom)]
      : [Math.max(r.left, from.left), Math.min(r.right, from.right)]
    const cross = lo <= hi ? 0 : lo - hi
    const score = Math.max(ahead, 0) + cross * 2 + (cross > 0 ? 1e6 : 0)
    if (score < best) { best = score; next = i }
  })
  return next
}

interface NavHandlers {
  // Nothing left to close on the page: leave it (history back or launcher).
  back(): void
  home?(): void
  menu?(): void
  search?(): void
  pagePrev?(): void
  pageNext?(): void
}

// Highlight-then-activate for form fields (TV-remote model): navigation only
// ever highlights a field, locked so arrows keep navigating and can't change
// its value. Activate (Enter / A) unlocks it for typing or opens its picker;
// Back or moving away re-locks it. Fields the nav never touched behave
// natively, so mouse users see no change.
const FIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=button]):not([type=submit]), textarea, select'
const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])'
const LAYERS = 'dialog[open], [aria-modal="true"], [role="dialog"]'
// A container whose children share one focus memory, like a row of tiles:
// coming back into it lands on the child last focused there, not on whichever
// child happens to be nearest the way in.
const GROUP = '[data-nav-group]'
const lastInGroup = new WeakMap<Element, HTMLElement>()

type FieldEl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

const field = (el: unknown): FieldEl | null =>
  el instanceof Element ? el.closest<FieldEl>(FIELD) : null
const locked = (el: FieldEl) => el.dataset.navLock === '1'

function lock(el: FieldEl) {
  el.dataset.navLock = '1'
  el.dataset.navManaged = '1'
  if ('readOnly' in el) el.readOnly = true
}

function unlock(el: FieldEl) {
  delete el.dataset.navLock
  el.dataset.navManaged = '1'
  if ('readOnly' in el) el.readOnly = false
  if (document.activeElement !== el) el.focus()
  if (el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && el.type === 'color')) {
    try { el.showPicker() } catch { /* unsupported or not allowed */ }
  }
}

const visible = (el: Element) => el.getClientRects().length > 0

// The top open layer (modal, dialog), so focus can't wander behind it.
function topLayer(): Element | null {
  const layers = [...document.querySelectorAll(LAYERS)].filter(visible)
  return layers.at(-1) ?? null
}

// Never act on shortcuts while typing or under a modifier chord. Highlighted
// (locked) fields don't count as typing, so navigation crosses them.
function typing(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.altKey || e.metaKey) return true
  const t = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')
  if (!t) return false
  const f = field(t)
  return f ? !locked(f) : false
}

const scroll = (): ScrollBehavior => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

function move(dir: Dir): boolean {
  const scope = topLayer() ?? document
  const candidates = [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if ((el as HTMLButtonElement).disabled || el.closest('[inert], [aria-hidden="true"]')) return false
    const r = el.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  })
  const active = document.activeElement as HTMLElement | null
  const from = active && candidates.includes(active) ? active : null
  const others = candidates.filter((el) => el !== from)
  const i = pickNext(from?.getBoundingClientRect() ?? null, dir, others.map((el) => el.getBoundingClientRect()), innerHeight)
  if (i === -1) {
    // Highlighted field at the edge: still swallow the arrow so it can't
    // change the field's value.
    const f = field(from)
    return !!f && locked(f)
  }
  let next = others[i]
  const group = next.closest(GROUP)
  const remembered = group && !(from && group.contains(from)) ? lastInGroup.get(group) : undefined
  if (remembered && others.includes(remembered)) next = remembered
  const f = field(next)
  if (f) lock(f)
  next.focus({ preventScroll: true })
  next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: scroll() })
  return true
}

function sendEscape() {
  const target = document.activeElement ?? document.body
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
}

// Installs keyboard handling and returns the dispatcher gamepad intents go to.
export function installNav(handlers: NavHandlers): (intent: Intent) => void {
  // Capture phase, so page handlers don't also act on the same keypress.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement && /^(checkbox|radio)$/.test(e.target.type)) {
      e.preventDefault()
      e.target.click()
      return
    }
    const f = field(e.target)
    if (!f) return
    if (locked(f)) {
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        unlock(f)
      } else if (e.key.length === 1 && f instanceof HTMLSelectElement) {
        e.preventDefault() // no letter-jump while merely highlighted
      }
    } else if (e.key === 'Escape' && e.isTrusted) {
      e.preventDefault()
      e.stopPropagation()
      lock(f)
    }
  }, true)

  // Clicking a highlighted field activates it, letting the click place the
  // caret or open the picker natively.
  document.addEventListener('pointerdown', (e) => {
    const f = field(e.target)
    if (f && locked(f)) {
      delete f.dataset.navLock
      if ('readOnly' in f) f.readOnly = false
    }
  }, true)

  document.addEventListener('focusin', (e) => {
    const group = e.target instanceof HTMLElement ? e.target.closest(GROUP) : null
    if (group) lastInGroup.set(group, e.target as HTMLElement)
  })

  // Leaving a managed field re-locks it; so does committing a picker, where
  // focus stays on the field.
  document.addEventListener('focusout', (e) => {
    const f = field(e.target)
    if (f?.dataset.navManaged === '1') lock(f)
  })
  document.addEventListener('change', (e) => {
    const f = field(e.target)
    if (f?.dataset.navManaged === '1' && (f instanceof HTMLSelectElement || f.type === 'color')) lock(f)
  })

  document.addEventListener('keydown', (e) => {
    // A single-line box has no use for Up/Down, so they leave it rather than
    // trapping a controller in the search field.
    const vertical = (e.key === 'ArrowUp' || e.key === 'ArrowDown')
      && e.target instanceof HTMLInputElement && !(e.ctrlKey || e.altKey || e.metaKey)
    if (e.defaultPrevented || (typing(e) && !vertical)) return
    const dir = KEY_DIRS[e.key]
    if (dir) {
      if (move(dir)) e.preventDefault()
    } else if (e.key === 'Escape' && e.isTrusted && !topLayer()) {
      // An open layer is the page's to close on Escape.
      e.preventDefault()
      handlers.back()
    }
  })

  // Back peels off one layer per press: an active field, then the page's
  // open layer (sent the Escape it expects), and only then the page itself.
  const back = () => {
    const f = field(document.activeElement)
    if (f && !locked(f)) lock(f)
    else if (topLayer()) sendEscape()
    else handlers.back()
  }

  return (intent) => {
    switch (intent) {
      case 'up': case 'down': case 'left': case 'right':
        move(DIRS[intent])
        break
      case 'activate': {
        const el = document.activeElement
        const f = field(el)
        if (f && locked(f)) unlock(f)
        else if (el instanceof HTMLElement && el !== document.body) el.click()
        else move(DIRS.down)
        break
      }
      case 'back': back(); break
      case 'menu': handlers.menu?.(); break
      case 'search': handlers.search?.(); break
      case 'home': handlers.home?.(); break
      case 'page-prev': handlers.pagePrev?.(); break
      case 'page-next': handlers.pageNext?.(); break
      case 'page-up': scrollBy({ top: -innerHeight * 0.8, behavior: scroll() }); break
      case 'page-down': scrollBy({ top: innerHeight * 0.8, behavior: scroll() }); break
    }
  }
}
