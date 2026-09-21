import { describe, it, expect, vi } from 'vitest'
import type { WebContents } from 'electron'
import { createTearOffService } from '../../../src/main/tearOff'
import type { OpenWindowOptions, WindowInfo } from '../../../src/main/windows'

const snapshot = { windowId: 'detached', projectRoot: null, sidebar: { open: true, expanded: [] }, layout: { kind: 'leaf' as const, tabs: [], active: null }, activePath: [] }
const bounds = { x: 10, y: 20, width: 800, height: 600 }
const sender = (id: number) => ({ id }) as WebContents

const fakeWindow = (visible: boolean) => {
  let destroyed = false
  const listeners: Record<string, () => void> = {}
  return {
    setPosition: vi.fn(),
    focus: vi.fn(),
    destroy: vi.fn(() => {
      destroyed = true
    }),
    isDestroyed: () => destroyed,
    isVisible: () => visible,
    once: vi.fn((event: string, fn: () => void) => {
      listeners[event] = fn
    }),
    fire: (event: string) => listeners[event]?.(),
  }
}

const setup = (visible = true) => {
  const opened: OpenWindowOptions[] = []
  const windows: ReturnType<typeof fakeWindow>[] = []
  const clearDirty = vi.fn(async () => undefined)
  const openWindow = (options: OpenWindowOptions): WindowInfo => {
    opened.push(options)
    const window = fakeWindow(visible)
    windows.push(window)
    return { windowId: `w${opened.length + 1}`, window: window as never, startupPaths: [], projectRoot: null, session: null, recoverDirtyIds: [] }
  }
  return { service: createTearOffService({ openWindow, clearDirty }), opened, windows, clearDirty }
}

describe('tear-off service', () => {
  it('a live start opens the window inactive at the given bounds and moves follow it', () => {
    const { service, opened, windows } = setup()
    expect(service.start(sender(1), snapshot, bounds, true)).toBe('w2')
    expect(opened[0]).toEqual({ projectRoot: null, session: snapshot, bounds, inactive: true })

    service.move(sender(1), { x: 300.4, y: 40.6 })
    expect(windows[0]!.setPosition).toHaveBeenCalledWith(300, 41)
    service.move(sender(2), { x: 0, y: 0 })
    expect(windows[0]!.setPosition).toHaveBeenCalledTimes(1)
  })

  it('commit focuses a visible window, reports it, and forgets it', () => {
    const { service, windows } = setup()
    service.start(sender(1), snapshot, bounds, true)
    expect(service.commit(sender(1))).toBe(true)
    expect(windows[0]!.focus).toHaveBeenCalledTimes(1)
    service.move(sender(1), { x: 5, y: 5 })
    expect(windows[0]!.setPosition).not.toHaveBeenCalled()
    expect(service.commit(sender(1))).toBe(false)
  })

  it('a second live start for the same source discards the window the first one left behind', async () => {
    const { service, windows, clearDirty } = setup()
    service.start(sender(1), snapshot, bounds, true)
    service.start(sender(1), snapshot, bounds, true)
    expect(windows[0]!.destroy).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    expect(clearDirty).toHaveBeenCalledWith('w2')
    expect(service.commit(sender(1))).toBe(true)
    expect(windows[1]!.focus).toHaveBeenCalledTimes(1)
  })

  it('commit on a window not yet shown focuses it once it shows', () => {
    const { service, windows } = setup(false)
    service.start(sender(1), snapshot, bounds, true)
    service.commit(sender(1))
    expect(windows[0]!.focus).not.toHaveBeenCalled()
    windows[0]!.fire('show')
    expect(windows[0]!.focus).toHaveBeenCalledTimes(1)
  })

  it('cancel destroys the window and clears the unsaved text it may have written', async () => {
    const { service, windows, clearDirty } = setup()
    service.start(sender(1), snapshot, bounds, true)
    await service.cancel(sender(1))
    expect(windows[0]!.destroy).toHaveBeenCalledTimes(1)
    expect(clearDirty).toHaveBeenCalledWith('w2')
    await service.cancel(sender(1))
    expect(windows[0]!.destroy).toHaveBeenCalledTimes(1)
  })

  it('a non-live start is a plain window that commit and cancel leave alone', async () => {
    const { service, opened, windows } = setup()
    service.start(sender(1), snapshot, bounds, false)
    expect(opened[0]!.inactive).toBe(false)
    expect(service.commit(sender(1))).toBe(false)
    await service.cancel(sender(1))
    expect(windows[0]!.focus).not.toHaveBeenCalled()
    expect(windows[0]!.destroy).not.toHaveBeenCalled()
  })
})
