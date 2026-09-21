import { createSignal } from 'solid-js'
import type { PaneId, TabId } from '../layout/paneTree'

export type TabDrag = { readonly tabId: TabId; readonly fromPaneId: PaneId; readonly title: string }
export type DropTarget = { readonly paneId: PaneId; readonly index: number }
export type Point = { readonly x: number; readonly y: number }

const [draggingTab, setDraggingTab] = createSignal<TabDrag | null>(null)
const [dropTarget, setDropTarget] = createSignal<DropTarget | null>(null)
const [ghostAt, setGhostAt] = createSignal<Point | null>(null)

export { draggingTab, dropTarget, setDropTarget, ghostAt, setGhostAt }

export const beginTabDrag = (drag: TabDrag): void => {
  setDraggingTab(drag)
}

export const endTabDrag = (): void => {
  setDraggingTab(null)
  setDropTarget(null)
  setGhostAt(null)
}

export type HorizontalEdges = { readonly left: number; readonly right: number }

export const dropIndexAt = (tabs: readonly HorizontalEdges[], x: number): number => {
  const before = tabs.findIndex((t) => x < (t.left + t.right) / 2)
  return before === -1 ? tabs.length : before
}

export type ScreenRect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

// hysteresis: a drag leaves the window only once it is `margin` px beyond an edge and comes back
// only once it is `margin` px inside every edge, so wobbling on the frame does not flicker windows
export const outsideBy = (point: Point, win: ScreenRect, margin: number): boolean =>
  point.x < win.x - margin || point.y < win.y - margin || point.x >= win.x + win.width + margin || point.y >= win.y + win.height + margin

export const insideBy = (point: Point, win: ScreenRect, margin: number): boolean =>
  point.x >= win.x + margin && point.y >= win.y + margin && point.x < win.x + win.width - margin && point.y < win.y + win.height - margin

// the torn-off window is placed so its first tab sits under the pointer exactly where the tab was grabbed
export const tornBounds = (pointer: Point, grab: Point, size: { readonly width: number; readonly height: number }): ScreenRect => ({
  x: Math.round(pointer.x - grab.x),
  y: Math.round(pointer.y - grab.y),
  width: size.width,
  height: size.height,
})
