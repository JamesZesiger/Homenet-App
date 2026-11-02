// Gamepad -> intent layer, per homenet's docs/CONTROLLER-ACCESS.md. The Gamepad
// API exposes only a state snapshot, so a rAF loop polls while a pad is
// connected, diffs against the previous frame and emits edge-triggered
// intents. Directions auto-repeat with a delay-then-rate curve, like a key.

export type Intent =
  | 'up' | 'down' | 'left' | 'right'
  | 'activate' | 'back' | 'menu' | 'search'
  | 'page-prev' | 'page-next' | 'page-up' | 'page-down'
  | 'home'

const DIRECTIONS = new Set<Intent>(['up', 'down', 'left', 'right'])

// Standard-mapping button indices. Y (3) is deliberately unassigned.
export const BUTTON_INTENTS: Record<number, Intent> = {
  0: 'activate', 1: 'back', 2: 'search',
  4: 'page-prev', 5: 'page-next', 6: 'page-up', 7: 'page-down',
  9: 'menu',
  12: 'up', 13: 'down', 14: 'left', 15: 'right',
  16: 'home',
}

export const REPEAT_DELAY_MS = 400
export const REPEAT_RATE_MS = 90
const DEADZONE = 0.5

export interface PadSnapshot {
  buttons: readonly { pressed: boolean }[]
  axes: readonly number[]
}

// Intent -> when it next fires while held (absent when released).
export type HoldState = Map<Intent, number>

function heldIntents(pads: readonly PadSnapshot[]): Set<Intent> {
  const held = new Set<Intent>()
  for (const pad of pads) {
    pad.buttons.forEach((b, i) => {
      if (b.pressed && BUTTON_INTENTS[i]) held.add(BUTTON_INTENTS[i])
    })
    const [x = 0, y = 0] = pad.axes
    if (x <= -DEADZONE) held.add('left')
    if (x >= DEADZONE) held.add('right')
    if (y <= -DEADZONE) held.add('up')
    if (y >= DEADZONE) held.add('down')
  }
  return held
}

// One poll step: which intents fire at `now`, given what was held before.
export function step(state: HoldState, pads: readonly PadSnapshot[], now: number): Intent[] {
  const held = heldIntents(pads)
  const fired: Intent[] = []
  for (const intent of state.keys()) if (!held.has(intent)) state.delete(intent)
  for (const intent of held) {
    const due = state.get(intent)
    if (due === undefined) {
      fired.push(intent)
      state.set(intent, DIRECTIONS.has(intent) ? now + REPEAT_DELAY_MS : Infinity)
    } else if (now >= due) {
      fired.push(intent)
      state.set(intent, now + REPEAT_RATE_MS)
    }
  }
  return fired
}

// Polls only while a pad is connected, and acts only while this document has
// focus: the launcher and a hosted app's view both see the same pad.
export function startGamepad(onIntent: (intent: Intent) => void): void {
  const state: HoldState = new Map()
  let frame = 0
  const pads = () => navigator.getGamepads().filter((p): p is Gamepad => p !== null)
  const poll = (now: number) => {
    const fired = step(state, pads(), now)
    if (document.hasFocus()) fired.forEach(onIntent)
    frame = requestAnimationFrame(poll)
  }
  const start = () => {
    if (!frame) frame = requestAnimationFrame(poll)
  }
  window.addEventListener('gamepadconnected', start)
  window.addEventListener('gamepaddisconnected', () => {
    if (pads().length) return
    cancelAnimationFrame(frame)
    frame = 0
    state.clear()
  })
  // A pad already exposed to this page is listed without a new event.
  if (pads().length) start()
}
