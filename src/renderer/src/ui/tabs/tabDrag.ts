import { createSignal } from 'solid-js'
import type { PaneId, TabId } from '../layout/paneTree'

export const tabMime = 'application/x-moru-tab'

export type TabDrag = { readonly tabId: TabId; readonly fromPaneId: PaneId }
export type DropTarget = { readonly paneId: PaneId; readonly index: number }

const [draggingTab, setDraggingTab] = createSignal<TabDrag | null>(null)
const [dropTarget, setDropTarget] = createSignal<DropTarget | null>(null)

export { draggingTab, dropTarget, setDropTarget }

export const beginTabDrag = (drag: TabDrag): void => {
  setDraggingTab(drag)
}

export const endTabDrag = (): void => {
  setDraggingTab(null)
  setDropTarget(null)
}

export type HorizontalEdges = { readonly left: number; readonly right: number }

export const dropIndexAt = (tabs: readonly HorizontalEdges[], x: number): number => {
  const before = tabs.findIndex((t) => x < (t.left + t.right) / 2)
  return before === -1 ? tabs.length : before
}

export type ScreenRect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export const droppedOutside = (point: { readonly x: number; readonly y: number }, win: ScreenRect): boolean =>
  point.x < win.x || point.y < win.y || point.x >= win.x + win.width || point.y >= win.y + win.height
