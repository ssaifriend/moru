import type { WebContents } from 'electron'
import { D } from '@mobily/ts-belt'
import type { Bounds, WindowSnapshot } from '@shared/session'
import type { OpenWindowOptions, WindowInfo } from './windows'

type Deps = {
  readonly openWindow: (options: OpenWindowOptions) => WindowInfo
  readonly clearDirty: (windowId: string) => Promise<void>
}

export type TearOffService = {
  readonly start: (source: WebContents, snapshot: WindowSnapshot, bounds: Bounds, live: boolean) => string
  readonly move: (source: WebContents, to: { readonly x: number; readonly y: number }) => void
  readonly commit: (source: WebContents) => boolean
  readonly cancel: (source: WebContents) => Promise<void>
}

// A live tear-off is a window that exists while the pointer is still down: it follows the pointer,
// gains focus only on commit, and is destroyed (with any unsaved text it wrote) if the drag comes back.
export const createTearOffService = ({ openWindow, clearDirty }: Deps): TearOffService => {
  let live: Record<number, WindowInfo> = {}

  const take = (source: WebContents): WindowInfo | undefined => {
    const info = live[source.id]
    live = D.deleteKey(live, source.id)
    return info
  }

  const discard = async (info: WindowInfo): Promise<void> => {
    if (!info.window.isDestroyed()) info.window.destroy()
    await clearDirty(info.windowId)
    setTimeout(() => void clearDirty(info.windowId), 1500).unref()
  }

  return {
    start: (source, snapshot, bounds, isLive) => {
      const stale = take(source)
      if (stale) void discard(stale)
      const info = openWindow({ projectRoot: null, session: snapshot, bounds, inactive: isLive })
      if (isLive) live = D.set(live, source.id, info)
      return info.windowId
    },
    move: (source, to) => {
      const info = live[source.id]
      if (info && !info.window.isDestroyed()) info.window.setPosition(Math.round(to.x), Math.round(to.y))
    },
    commit: (source) => {
      const info = take(source)
      if (!info || info.window.isDestroyed()) return false
      if (info.window.isVisible()) info.window.focus()
      else info.window.once('show', () => info.window.focus())
      return true
    },
    cancel: async (source) => {
      const info = take(source)
      if (info) await discard(info)
    },
  }
}
