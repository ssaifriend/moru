import { dirname, sep } from 'node:path'
import { A, pipe } from '@mobily/ts-belt'
import type { Event } from '@parcel/watcher'

export const maxChangedDirs = 500

const under = (path: string, root: string): boolean => path === root || path.startsWith(root + sep)

// parent directories whose listing changed, expressed under the root as the window opened it:
// FSEvents reports real paths, so a root reached through a symlink (/var → /private/var) is mapped back
export const changedDirsOf = (events: readonly Event[], root: string, realRoot: string): readonly string[] => {
  const toRoot = (path: string): string => (realRoot !== root && under(path, realRoot) ? root + path.slice(realRoot.length) : path)
  return pipe(
    events,
    A.filter((e) => e.type !== 'update'),
    A.map((e) => toRoot(dirname(e.path))),
    A.uniq,
  )
}
