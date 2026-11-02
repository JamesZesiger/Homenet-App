import { describe, expect, it } from 'vitest'
import { REPEAT_DELAY_MS, REPEAT_RATE_MS, step, type HoldState, type PadSnapshot } from '../src/shared/input/intents'

function pad(pressed: number[] = [], axes: number[] = [0, 0]): PadSnapshot {
  return { buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })), axes }
}

describe('step', () => {
  it('fires a button once per press', () => {
    const state: HoldState = new Map()
    expect(step(state, [pad([0])], 0)).toEqual(['activate'])
    expect(step(state, [pad([0])], 5000)).toEqual([])
    expect(step(state, [pad()], 5016)).toEqual([])
    expect(step(state, [pad([0])], 5032)).toEqual(['activate'])
  })

  it('repeats a held direction after a delay, then at the rate', () => {
    const state: HoldState = new Map()
    expect(step(state, [pad([13])], 0)).toEqual(['down'])
    expect(step(state, [pad([13])], REPEAT_DELAY_MS - 1)).toEqual([])
    expect(step(state, [pad([13])], REPEAT_DELAY_MS)).toEqual(['down'])
    expect(step(state, [pad([13])], REPEAT_DELAY_MS + REPEAT_RATE_MS)).toEqual(['down'])
  })

  it('maps the left stick past the deadzone', () => {
    expect(step(new Map(), [pad([], [0.3, 0])], 0)).toEqual([])
    expect(step(new Map(), [pad([], [-0.9, 0.8])], 0)).toEqual(['left', 'down'])
  })

  it('treats D-pad and stick in the same direction as one hold', () => {
    const state: HoldState = new Map()
    expect(step(state, [pad([15], [1, 0])], 0)).toEqual(['right'])
  })

  it('maps X, shoulders, triggers, start and guide', () => {
    expect(step(new Map(), [pad([2, 4, 5, 6, 7, 9, 16])], 0)).toEqual(
      ['search', 'page-prev', 'page-next', 'page-up', 'page-down', 'menu', 'home'],
    )
  })
})
