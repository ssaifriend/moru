import { describe, it, expect } from 'vitest'
import { dropIndexAt, insideBy, outsideBy, tornBounds } from '@renderer/ui/tabs/tabDrag'

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

describe('window edge hysteresis', () => {
  const win = { x: 100, y: 50, width: 800, height: 600 }

  it('outsideBy needs the pointer past the edge by the margin', () => {
    expect(outsideBy({ x: 95, y: 300 }, win, 6)).toBe(false)
    expect(outsideBy({ x: 93, y: 300 }, win, 6)).toBe(true)
    expect(outsideBy({ x: 905, y: 300 }, win, 6)).toBe(false)
    expect(outsideBy({ x: 906, y: 300 }, win, 6)).toBe(true)
    expect(outsideBy({ x: 500, y: 656 }, win, 6)).toBe(true)
    expect(outsideBy({ x: 500, y: 300 }, win, 6)).toBe(false)
  })

  it('insideBy needs the pointer inside every edge by the margin', () => {
    expect(insideBy({ x: 105, y: 300 }, win, 6)).toBe(false)
    expect(insideBy({ x: 106, y: 300 }, win, 6)).toBe(true)
    expect(insideBy({ x: 500, y: 644 }, win, 6)).toBe(false)
    expect(insideBy({ x: 500, y: 643 }, win, 6)).toBe(true)
  })

  it('leaves a dead band on the frame where neither holds', () => {
    const onFrame = { x: 100, y: 300 }
    expect(outsideBy(onFrame, win, 6)).toBe(false)
    expect(insideBy(onFrame, win, 6)).toBe(false)
  })
})

describe('tornBounds', () => {
  it('offsets the window so the grabbed point of the tab stays under the pointer', () => {
    expect(tornBounds({ x: 640.4, y: 300.6 }, { x: 30, y: 12 + 28 }, { width: 1200, height: 800 })).toEqual({
      x: 610,
      y: 261,
      width: 1200,
      height: 800,
    })
  })
})
