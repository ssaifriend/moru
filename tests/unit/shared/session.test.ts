import { describe, it, expect } from 'vitest'
import { SessionFile, WindowSnapshot, dirtyIdsOf, singleTabWindow, type BufferTabSnapshot, type PaneSnapshot } from '@shared/session'

const snapshot = {
  windowId: 'w1',
  projectRoot: '/p',
  sidebar: { open: true, expanded: ['/p/src'] },
  layout: {
    kind: 'split',
    direction: 'row',
    sizes: [0.5, 0.5],
    children: [
      {
        kind: 'leaf',
        active: 0,
        tabs: [
          {
            kind: 'buffer', path: '/p/a.ts', dirtyId: 'w1:b1', format: { encoding: 'utf8', bom: false, eol: 'lf' },
            hash: 'h', docHash: 'd', selection: { anchor: 1, head: 1 }, scrollTop: 0, history: null, languageId: 'typescript',
          },
        ],
      },
      { kind: 'leaf', active: 0, tabs: [{ kind: 'terminal', cwd: '/p', title: 'Terminal 1' }] },
    ],
  },
  activePath: [1],
}

describe('session schemas', () => {
  it('accepts a nested snapshot and rejects unknown tab kinds', () => {
    expect(WindowSnapshot.safeParse(snapshot).success).toBe(true)
    expect(SessionFile.safeParse({ version: 1, cleanExit: false, windows: [{ snapshot, bounds: null }] }).success).toBe(true)
    const bad = { ...snapshot, layout: { kind: 'leaf', active: 0, tabs: [{ kind: 'diff' }] } }
    expect(WindowSnapshot.safeParse(bad).success).toBe(false)
  })
})

const bufferTab = (dirtyId: string): BufferTabSnapshot => ({
  kind: 'buffer', path: '/p/a.ts', dirtyId, format: { encoding: 'utf8', bom: false, eol: 'lf' },
  hash: 'h', docHash: 'd', selection: { anchor: 1, head: 1 }, scrollTop: 0, history: null, languageId: 'typescript',
})

describe('dirtyIdsOf', () => {
  it('collects buffer dirty ids across nested splits and skips other tab kinds', () => {
    const layout: PaneSnapshot = {
      kind: 'split',
      direction: 'row',
      sizes: [0.5, 0.5],
      children: [
        { kind: 'leaf', tabs: [bufferTab('w1:b1'), { kind: 'terminal', cwd: '/', title: 'sh' }], active: 0 },
        { kind: 'leaf', tabs: [bufferTab('w1:b2')], active: 0 },
      ],
    }
    expect(dirtyIdsOf(layout)).toEqual(['w1:b1', 'w1:b2'])
  })
})

describe('singleTabWindow', () => {
  it('wraps one tab in a folder-less window snapshot that validates', () => {
    const tab = bufferTab('handoff:w1:b1:1')
    const win = singleTabWindow(tab)
    expect(WindowSnapshot.safeParse(win).success).toBe(true)
    expect(win.projectRoot).toBeNull()
    expect(win.layout).toEqual({ kind: 'leaf', tabs: [tab], active: 0 })
  })
})
