import { describe, it, expect } from 'vitest'
import { sep } from 'node:path'
import { changedDirsOf } from '../../../src/main/index/changedDirs'

const p = (...parts: string[]) => parts.join(sep)
const ev = (type: 'create' | 'update' | 'delete', path: string) => ({ type, path })

describe('changedDirsOf', () => {
  const root = p('', 'proj')

  it('reports each parent directory once and ignores content updates', () => {
    const events = [
      ev('create', p(root, 'src', 'a.ts')),
      ev('delete', p(root, 'src', 'b.ts')),
      ev('update', p(root, 'README.md')),
      ev('create', p(root, 'docs')),
    ]
    expect(changedDirsOf(events, root, root)).toEqual([p(root, 'src'), root])
  })

  it('maps real paths back under the root the window opened', () => {
    const real = p('', 'private', 'proj')
    const events = [ev('create', p(real, 'src', 'a.ts')), ev('create', p(real, 'top.txt'))]
    expect(changedDirsOf(events, root, real)).toEqual([p(root, 'src'), root])
  })

  it('does not treat a sibling with the same prefix as inside the root', () => {
    const real = p('', 'private', 'proj')
    const events = [ev('create', p('', 'private', 'proj-other', 'x'))]
    expect(changedDirsOf(events, root, real)).toEqual([p('', 'private', 'proj-other')])
  })

  it('is empty when nothing but updates happened', () => {
    expect(changedDirsOf([ev('update', p(root, 'a'))], root, root)).toEqual([])
  })
})
