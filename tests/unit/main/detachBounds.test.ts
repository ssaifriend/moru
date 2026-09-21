import { describe, it, expect } from 'vitest'
import { detachedBounds } from '../../../src/main/detachBounds'

const area = { x: 0, y: 25, width: 1920, height: 1055 }

describe('detachedBounds', () => {
  it('puts the tab strip under the drop point', () => {
    expect(detachedBounds({ x: 600, y: 400 }, area)).toEqual({ x: 540, y: 380, width: 1000, height: 700 })
  })

  it('stays inside the display work area', () => {
    expect(detachedBounds({ x: 10, y: 5 }, area)).toEqual({ x: 0, y: 25, width: 1000, height: 700 })
    expect(detachedBounds({ x: 1900, y: 1070 }, area)).toEqual({ x: 920, y: 380, width: 1000, height: 700 })
  })

  it('shrinks to fit a small display', () => {
    const small = { x: 0, y: 0, width: 800, height: 500 }
    expect(detachedBounds({ x: 400, y: 250 }, small)).toEqual({ x: 0, y: 0, width: 800, height: 500 })
  })
})
