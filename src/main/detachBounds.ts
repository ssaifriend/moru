import type { Bounds } from '@shared/session'

export type ScreenPoint = { readonly x: number; readonly y: number }

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

// a window torn off by a tab drag lands with its tab strip under the pointer, kept inside the display it dropped on
export const detachedBounds = (at: ScreenPoint, area: Bounds, size: { width: number; height: number } = { width: 1000, height: 700 }): Bounds => {
  const width = Math.min(size.width, area.width)
  const height = Math.min(size.height, area.height)
  return {
    x: clamp(at.x - 60, area.x, area.x + area.width - width),
    y: clamp(at.y - 20, area.y, area.y + area.height - height),
    width,
    height,
  }
}
