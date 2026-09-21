import { describe, it, expect } from 'vitest'
import { dropIndexAt, droppedOutside } from '@renderer/ui/tabs/tabDrag'

const tabs = [
  { left: 0, right: 100 },
  { left: 100, right: 200 },
  { left: 200, right: 300 },
]

describe('dropIndexAt', () => {
  it('inserts before the tab whose midpoint is right of the pointer', () => {
    expect(dropIndexAt(tabs, 10)).toBe(0)
    expect(dropIndexAt(tabs, 60)).toBe(1)
    expect(dropIndexAt(tabs, 149)).toBe(1)
    expect(dropIndexAt(tabs, 151)).toBe(2)
  })

  it('appends past the last midpoint or when the strip is empty', () => {
    expect(dropIndexAt(tabs, 260)).toBe(3)
    expect(dropIndexAt(tabs, 900)).toBe(3)
    expect(dropIndexAt([], 40)).toBe(0)
  })
})

describe('droppedOutside', () => {
  const win = { x: 100, y: 50, width: 800, height: 600 }

  it('is false anywhere inside the window, edges included', () => {
    expect(droppedOutside({ x: 100, y: 50 }, win)).toBe(false)
    expect(droppedOutside({ x: 500, y: 300 }, win)).toBe(false)
    expect(droppedOutside({ x: 899, y: 649 }, win)).toBe(false)
  })

  it('is true past any edge', () => {
    expect(droppedOutside({ x: 99, y: 300 }, win)).toBe(true)
    expect(droppedOutside({ x: 900, y: 300 }, win)).toBe(true)
    expect(droppedOutside({ x: 500, y: 49 }, win)).toBe(true)
    expect(droppedOutside({ x: 500, y: 650 }, win)).toBe(true)
  })
})
