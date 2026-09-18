import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WebContents } from 'electron'
import { rgPath } from '@vscode/ripgrep'
import { describe, it, expect } from 'vitest'
import { createIndexRegistry } from '../../../src/main/index/registry'

const fakeSender = (id: number): WebContents => ({ id }) as unknown as WebContents
const project = (name: string): string => {
  const root = mkdtempSync(join(tmpdir(), `moru-reg-${name}-`))
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src', `${name}.ts`), 'x\n')
  return root
}
const noSubscribe = async () => ({ unsubscribe: async () => undefined })

describe('index registry', () => {
  it('keeps one index per root and answers each window from its own root', async () => {
    const pushed: number[] = []
    const registry = createIndexRegistry({ rgPath, subscribe: noSubscribe as never, pushTo: (target) => pushed.push(target.id) })
    const a = fakeSender(1)
    const b = fakeSender(2)
    const rootA = project('alpha')
    const rootB = project('beta')

    expect((await registry.build(a, rootA)).files).toBe(1)
    expect((await registry.build(b, rootB)).files).toBe(1)
    expect((await registry.query(a, 'alpha', 5)).map((i) => i.rel)).toEqual(['src/alpha.ts'])
    expect((await registry.query(a, 'beta', 5))).toEqual([])
    expect((await registry.query(b, 'beta', 5)).map((i) => i.rel)).toEqual(['src/beta.ts'])

    await registry.build(b, rootA)
    expect((await registry.query(b, 'alpha', 5)).map((i) => i.rel)).toEqual(['src/alpha.ts'])
    await registry.release(a)
    expect(await registry.query(a, 'alpha', 5)).toEqual([])
    expect((await registry.query(b, 'alpha', 5)).length).toBe(1)
    await registry.dispose()
  })
})
