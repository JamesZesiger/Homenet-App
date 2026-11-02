// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'

// jsdom has no layout, so give each element a fixed box from data-box="l,t,w,h".
function layout() {
  HTMLElement.prototype.getBoundingClientRect = function () {
    const [l, t, w, h] = (this.dataset.box ?? '0,0,0,0').split(',').map(Number)
    return { left: l, top: t, right: l + w, bottom: t + h, width: w, height: h, x: l, y: t, toJSON() {} } as DOMRect
  }
  HTMLElement.prototype.scrollIntoView = () => {}
}

describe('focus groups', () => {
  let dispatch: (intent: 'up' | 'down' | 'left' | 'right') => void

  beforeAll(async () => {
    layout()
    window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia
    document.body.innerHTML = `
      <button id="gear" data-box="900,0,40,40">gear</button>
      <div data-nav-group>
        <button id="a" data-box="0,100,200,100">a</button>
        <button id="b" data-box="250,100,200,100">b</button>
        <button id="c" data-box="850,100,200,100">c</button>
      </div>`
    const { installNav } = await import('../src/shared/input/spatial')
    dispatch = installNav({ back: () => {} })
  })

  it('returns to the tile last focused in the row, not the one nearest the way back in', () => {
    document.getElementById('b')!.focus()
    dispatch('up')
    expect(document.activeElement?.id).toBe('gear')
    dispatch('down')
    expect(document.activeElement?.id).toBe('b')
  })

  it('still moves freely within the row', () => {
    document.getElementById('b')!.focus()
    dispatch('right')
    expect(document.activeElement?.id).toBe('c')
  })
})
