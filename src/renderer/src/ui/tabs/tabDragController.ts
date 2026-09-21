import type { Workspace } from '../../app/workspace'
import type { PaneId, TabId } from '../layout/paneTree'
import {
  beginTabDrag, dropIndexAt, dropTarget, endTabDrag, insideBy, outsideBy, setDropTarget, setGhostAt, tornBounds,
  type DropTarget, type Point, type ScreenRect,
} from './tabDrag'

export type GrabbedTab = { readonly tabId: TabId; readonly paneId: PaneId; readonly title: string }

const dragThresholdPx = 4
const edgeMarginPx = 6

let dragInProgress = false

const windowRect = (): ScreenRect => ({ x: window.screenX, y: window.screenY, width: window.outerWidth, height: window.outerHeight })

const hitTest = (clientX: number, clientY: number): DropTarget | null => {
  const el = document.elementFromPoint(clientX, clientY)
  const pane = el?.closest<HTMLElement>('.pane')
  const paneId = pane?.dataset['paneId']
  if (!el || !pane || !paneId) return null

  const strip = pane.querySelector<HTMLElement>(':scope > .tabs')
  const tabs = strip ? Array.from(strip.querySelectorAll<HTMLElement>(':scope > .tab')) : []
  const onStrip = strip !== null && strip.contains(el)
  return { paneId, index: onStrip ? dropIndexAt(tabs.map((t) => t.getBoundingClientRect()), clientX) : tabs.length }
}

// One pointer drag of a tab: reorder or move between panes inside the window; past the window edge
// a live window is torn off and follows the pointer until release (commit) or re-entry / Escape (cancel).
export const beginTabPointerDrag = (ws: Workspace, down: MouseEvent, tab: GrabbedTab, tabRect: DOMRect): void => {
  if (dragInProgress) return
  dragInProgress = true

  const origin: Point = { x: down.clientX, y: down.clientY }
  const chromeHeight = window.outerHeight - window.innerHeight
  const grab: Point = { x: down.clientX - tabRect.left, y: down.clientY - tabRect.top + chromeHeight }
  const size = { width: window.outerWidth, height: window.outerHeight }
  let active = false
  let torn = false
  let last = origin

  const tear = (pointer: Point): void => {
    torn = true
    setDropTarget(null)
    void ws.tearOffStart(tab.tabId, tornBounds(pointer, grab, size)).then((started) => {
      if (!started) torn = false
    })
  }

  const move = (ev: MouseEvent): void => {
    if (ev.clientX === last.x && ev.clientY === last.y) return
    last = { x: ev.clientX, y: ev.clientY }

    if (!active) {
      if (Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < dragThresholdPx) return
      active = true
      beginTabDrag({ tabId: tab.tabId, fromPaneId: tab.paneId, title: tab.title })
      document.body.classList.add('tab-dragging')
    }
    setGhostAt(last)

    const pointer: Point = { x: ev.screenX, y: ev.screenY }
    const rect = windowRect()
    if (torn && insideBy(pointer, rect, edgeMarginPx)) {
      torn = false
      void ws.tearOffCancel()
    }
    if (torn) {
      ws.tearOffMove(tornBounds(pointer, grab, size))
      return
    }
    if (outsideBy(pointer, rect, edgeMarginPx) && ws.canDetach(tab.tabId)) {
      tear(pointer)
      return
    }
    setDropTarget(hitTest(ev.clientX, ev.clientY))
  }

  const finish = (commit: boolean): void => {
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('mousemove', move, true)
    window.removeEventListener('pointerup', up, true)
    window.removeEventListener('mouseup', up, true)
    window.removeEventListener('keydown', key, true)
    dragInProgress = false
    if (!active) return

    document.body.classList.remove('tab-dragging')
    const target = dropTarget()
    endTabDrag()

    if (torn) {
      if (commit) void ws.tearOffCommit(tab.tabId)
      else void ws.tearOffCancel()
      return
    }
    if (commit && target) ws.moveTabToPane(tab.tabId, target.paneId, target.index)
  }

  const up = (): void => finish(true)
  const key = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape') return
    ev.preventDefault()
    finish(false)
  }

  window.addEventListener('pointermove', move, true)
  window.addEventListener('mousemove', move, true)
  window.addEventListener('pointerup', up, true)
  window.addEventListener('mouseup', up, true)
  window.addEventListener('keydown', key, true)
}
