import { describe, expect, it } from 'vitest'
import { pickNext, type Rect } from '../src/shared/input/spatial'

const box = (left: number, top: number, w = 100, h = 50): Rect => ({ left, top, right: left + w, bottom: top + h })
const RIGHT: [number, number] = [1, 0]
const DOWN: [number, number] = [0, 1]

describe('pickNext', () => {
  it('starts at the top-left visible element', () => {
    expect(pickNext(null, DOWN, [box(500, 0), box(0, 200), box(0, 0)], 1000)).toBe(2)
  })

  it('prefers the far end of the same row over nearer diagonal content', () => {
    const from = box(0, 0)
    const farSameRow = box(900, 0)
    const nearBelow = box(150, 60)
    expect(pickNext(from, RIGHT, [nearBelow, farSameRow], 1000)).toBe(1)
  })

  it('picks the nearest in the same column', () => {
    expect(pickNext(box(0, 0), DOWN, [box(0, 400), box(0, 100)], 1000)).toBe(1)
  })

  it('reaches a narrow edge column from a full-width banner', () => {
    const banner = box(0, 0, 1000, 300)
    expect(pickNext(banner, DOWN, [box(900, 320), box(-500, 320)], 1000)).toBe(0)
  })

  it('ignores elements behind the origin', () => {
    expect(pickNext(box(500, 0), RIGHT, [box(0, 0)], 1000)).toBe(-1)
  })
})
