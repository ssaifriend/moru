import { describe, it, expect } from 'vitest'
import { carriesFiles, droppedPaths, shellQuote, uriListPaths } from '@renderer/app/fileDrop'

const data = (files: readonly string[], uriList = '') => ({
  types: files.length > 0 ? ['Files'] : uriList ? ['text/uri-list'] : ['text/plain'],
  files: files.map((name) => new File(['x'], name)),
  getData: (type: string) => (type === 'text/uri-list' ? uriList : ''),
})

describe('uriListPaths', () => {
  it('keeps file URLs, decodes them, and drops comments and other schemes', () => {
    const list = '# dropped\r\nfile:///Users/me/a%20b/%ED%95%9C%EA%B8%80.md\r\nhttps://example.com/x\r\n\r\nfile:///tmp/c.ts'
    expect(uriListPaths(list)).toEqual(['/Users/me/a b/한글.md', '/tmp/c.ts'])
  })

  it('turns a Windows file URL into a drive path', () => {
    expect(uriListPaths('file:///C:/Users/me/a.txt')).toEqual(['C:\\Users\\me\\a.txt'])
  })

  it('ignores garbage', () => {
    expect(uriListPaths('not a url\nfile:')).toEqual([])
  })
})

describe('droppedPaths', () => {
  it('prefers the paths the preload resolves for File objects', () => {
    const paths = droppedPaths(data(['a.ts', 'b.ts'], 'file:///ignored'), (f) => `/p/${f.name}`)
    expect(paths).toEqual(['/p/a.ts', '/p/b.ts'])
  })

  it('falls back to the URL list when no File resolves to a path', () => {
    expect(droppedPaths(data(['a.ts'], 'file:///q/a.ts'), () => '')).toEqual(['/q/a.ts'])
    expect(droppedPaths(data([], 'file:///q/b.ts'), () => '')).toEqual(['/q/b.ts'])
  })

  it('is empty for a plain text drag', () => {
    expect(droppedPaths(data([]), () => '')).toEqual([])
    expect(carriesFiles(['text/plain'])).toBe(false)
    expect(carriesFiles(['Files'])).toBe(true)
    expect(carriesFiles(['text/uri-list'])).toBe(true)
  })
})

describe('shellQuote', () => {
  it('leaves plain paths alone and double-quotes the rest', () => {
    expect(shellQuote('/tmp/a.ts')).toBe('/tmp/a.ts')
    expect(shellQuote('C:\\Users\\me\\a.txt')).toBe('C:\\Users\\me\\a.txt')
    expect(shellQuote('/tmp/a b.ts')).toBe('"/tmp/a b.ts"')
    expect(shellQuote('/tmp/한글.ts')).toBe('"/tmp/한글.ts"')
    expect(shellQuote('/tmp/$x "q".ts')).toBe('"/tmp/\\$x \\"q\\".ts"')
  })
})
