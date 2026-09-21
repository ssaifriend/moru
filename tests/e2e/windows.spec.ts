import { test, expect } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { launchApp } from './launch'

const fixture = resolve('tests/e2e/fixtures/ime.ts')

test('window.new opens a second window whose terminals are isolated', async () => {
  const { app, page } = await launchApp({ MORU_TEST_OPEN: fixture })
  const second = app.waitForEvent('window')
  await page.evaluate(() => window.__moruTest!.runCommand('window.new'))
  const page2 = await second
  await page2.waitForFunction(() => window.__moruTest?.ready() === true)

  expect(app.windows().length).toBe(2)
  expect(await page2.evaluate(() => window.__moruTest!.tabs()[0]?.tabs.length)).toBe(1)

  await page2.evaluate(() => window.__moruTest!.runCommand('terminal.new'))
  await page2.evaluate(() => window.__moruTest!.terminalFocus())
  await page2.keyboard.type('echo second-window\n')
  await expect.poll(() => page2.evaluate(() => window.__moruTest!.terminalText()), { timeout: 10_000 }).toContain('second-window')

  expect(await page.evaluate(() => window.__moruTest!.terminals().length)).toBe(0)
  const [id1, id2] = await Promise.all([
    page.evaluate(() => window.__moruTest!.windowId()),
    page2.evaluate(() => window.__moruTest!.windowId()),
  ])
  expect(id1).not.toBe(id2)

  await page2.close()
  await expect.poll(() => app.windows().length).toBe(1)
  await app.close()
})

test('window.new starts empty instead of inheriting the current folder', async () => {
  const root = mkdtempSync(join(tmpdir(), 'moru-win-'))
  writeFileSync(join(root, 'a.txt'), 'a\n')
  const { app, page } = await launchApp({ MORU_TEST_ROOT: root })
  await expect.poll(() => page.evaluate(() => window.__moruTest!.projectRoot())).toBe(root)

  await page.evaluate(() => window.__moruTest!.runCommand('window.new'))
  await expect.poll(() => app.windows().length).toBe(2)
  const second = app.windows().find((w) => w !== page)!
  await second.waitForFunction(() => window.__moruTest?.ready() === true)
  expect(await second.evaluate(() => window.__moruTest!.projectRoot())).toBeNull()
  expect(await second.evaluate(() => window.__moruTest!.tabs()[0]?.tabs.map((t) => t.title))).toEqual(['untitled'])
  await expect(second.getByTestId('sidebar')).toHaveCount(0)
  await expect(page.getByTestId('sidebar')).toBeVisible()
  await app.close()
})

test('each window has its own folder and Goto index', async () => {
  const rootA = mkdtempSync(join(tmpdir(), 'moru-win-a-'))
  const rootB = mkdtempSync(join(tmpdir(), 'moru-win-b-'))
  writeFileSync(join(rootA, 'alpha.ts'), 'a\n')
  writeFileSync(join(rootB, 'beta.ts'), 'b\n')
  const { app, page } = await launchApp({ MORU_TEST_ROOT: rootA })
  await page.evaluate(() => window.__moruTest!.runCommand('window.new'))
  await expect.poll(() => app.windows().length).toBe(2)
  const second = app.windows().find((w) => w !== page)!
  await second.waitForFunction(() => window.__moruTest?.ready() === true)
  await second.evaluate((r) => window.__moruTest!.setProjectRoot(r), rootB)

  expect(await page.evaluate(() => window.__moruTest!.projectRoot())).toBe(rootA)
  expect(await second.evaluate(() => window.__moruTest!.projectRoot())).toBe(rootB)
  const query = (w: typeof page, text: string) =>
    w.evaluate((t) => (window as unknown as { moru: { invoke: (c: string, p: unknown) => Promise<{ value?: { items: { rel: string }[] } }> } }).moru.invoke('index.query', { text: t, limit: 5 }).then((r) => r.value?.items.map((i) => i.rel) ?? []), text)
  await expect.poll(() => query(page, 'alpha')).toEqual(['alpha.ts'])
  await expect.poll(() => query(second, 'beta')).toEqual(['beta.ts'])
  expect(await query(page, 'beta')).toEqual([])
  expect(await query(second, 'alpha')).toEqual([])
  await app.close()
})

test('tab.moveToNewWindow carries an unsaved file tab into its own window and leaves an untitled here', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'moru-detach-'))
  const path = join(dir, 'a.txt')
  writeFileSync(path, 'disk\n')
  const { app, page } = await launchApp({ MORU_TEST_OPEN: path })
  await page.evaluate(() => window.__moruTest!.focus())
  await page.evaluate(() => window.__moruTest!.setCursor(0))
  await page.keyboard.type('edited ')

  const second = app.waitForEvent('window')
  await page.evaluate(() => window.__moruTest!.runCommand('tab.moveToNewWindow'))
  const page2 = await second
  await page2.waitForFunction(() => window.__moruTest?.ready() === true)

  expect(await page2.evaluate(() => window.__moruTest!.tabs()[0]?.tabs.map((t) => t.path))).toEqual([path])
  await expect.poll(() => page2.evaluate(() => window.__moruTest!.doc())).toBe('edited disk\n')
  expect(await page2.evaluate(() => window.__moruTest!.dirty())).toBe(true)
  expect(await page2.evaluate(() => window.__moruTest!.projectRoot())).toBeNull()

  await expect.poll(() => page.evaluate(() => window.__moruTest!.tabs()[0]?.tabs.map((t) => t.title))).toEqual(['untitled'])
  expect(await page.evaluate(() => window.__moruTest!.doc())).toBe('')
  await app.close()
})

test('tab.moveToNewWindow carries an untitled buffer with its text', async () => {
  const { app, page } = await launchApp()
  await page.evaluate(() => window.__moruTest!.focus())
  await page.keyboard.type('scratch 한글')

  const second = app.waitForEvent('window')
  await page.evaluate(() => window.__moruTest!.runCommand('tab.moveToNewWindow'))
  const page2 = await second
  await page2.waitForFunction(() => window.__moruTest?.ready() === true)

  expect(await page2.evaluate(() => window.__moruTest!.tabs()[0]?.tabs.map((t) => t.title))).toEqual(['untitled'])
  await expect.poll(() => page2.evaluate(() => window.__moruTest!.doc())).toBe('scratch 한글')
  await expect.poll(() => page.evaluate(() => window.__moruTest!.doc())).toBe('')
  await app.close()
})

test('tab.moveToNewWindow is refused while a folder is open', async () => {
  const root = mkdtempSync(join(tmpdir(), 'moru-detach-root-'))
  const path = join(root, 'a.txt')
  writeFileSync(path, 'a\n')
  const { app, page } = await launchApp({ MORU_TEST_ROOT: root, MORU_TEST_OPEN: path })
  await expect.poll(() => page.evaluate(() => window.__moruTest!.projectRoot())).toBe(root)

  await page.evaluate(() => window.__moruTest!.runCommand('tab.moveToNewWindow'))
  await page.waitForTimeout(500)
  expect(app.windows().length).toBe(1)
  expect(await page.evaluate(() => window.__moruTest!.tabs()[0]?.tabs.map((t) => t.path))).toEqual([path])
  await expect(page.getByTestId('status')).toContainText('folder open')
  await app.close()
})

test('window.new never adopts another window\'s unsaved buffer, and that buffer still survives a crash', async () => {
  const first = await launchApp()
  await first.page.evaluate(() => window.__moruTest!.focus())
  await first.page.keyboard.type('private draft')
  await first.page.waitForTimeout(1500)

  const w2 = first.app.waitForEvent('window')
  await first.page.evaluate(() => window.__moruTest!.runCommand('window.new'))
  const page2 = await w2
  await page2.waitForFunction(() => window.__moruTest?.ready() === true)
  expect(await page2.evaluate(() => window.__moruTest!.tabs()[0]?.tabs.map((t) => t.title))).toEqual(['untitled'])
  expect(await page2.evaluate(() => window.__moruTest!.doc())).toBe('')
  expect(await first.page.evaluate(() => window.__moruTest!.doc())).toBe('private draft')

  await first.page.waitForTimeout(1500)
  first.app.process().kill('SIGKILL')
  await new Promise((r) => setTimeout(r, 500))

  const second = await launchApp({}, { userData: first.userData })
  await expect.poll(() => second.app.windows().length).toBe(2)
  const docs = async () => Promise.all(second.app.windows().map((w) => w.evaluate(() => window.__moruTest?.ready() ? window.__moruTest.doc() : null)))
  await expect.poll(docs, { timeout: 10_000 }).toContain('private draft')
  await second.app.close()
})

test('a tab dragged past the window edge tears off live, comes back on re-entry or Escape, and commits on release', async () => {
  const { app, page } = await launchApp()
  await page.evaluate(() => window.__moruTest!.focus())
  await page.keyboard.type('torn off')
  const tabs = () => page.evaluate(() => window.__moruTest!.tabs()[0]?.tabs.map((t) => t.title))
  const tab = (await page.locator('.tab').first().boundingBox())!
  const inside = { x: tab.x + 20, y: tab.y + tab.height / 2 }
  const outside = { x: -400, y: inside.y }

  await page.mouse.move(inside.x, inside.y)
  await page.mouse.down()
  await page.mouse.move(inside.x + 30, inside.y + 6, { steps: 3 })
  await page.mouse.move(outside.x, outside.y, { steps: 6 })
  await expect.poll(() => app.windows().length).toBe(2)
  expect(await tabs()).toEqual(['untitled'])

  await page.mouse.move(inside.x + 200, inside.y + 100, { steps: 6 })
  await expect.poll(() => app.windows().length).toBe(1)
  expect(await tabs()).toEqual(['untitled'])
  expect(await page.evaluate(() => window.__moruTest!.doc())).toBe('torn off')

  await page.mouse.move(outside.x, outside.y, { steps: 6 })
  await expect.poll(() => app.windows().length).toBe(2)
  await page.keyboard.press('Escape')
  await expect.poll(() => app.windows().length).toBe(1)
  expect(await page.evaluate(() => window.__moruTest!.doc())).toBe('torn off')
  expect(await page.locator('.tab-ghost').count()).toBe(0)

  await page.mouse.move(inside.x, inside.y)
  await page.mouse.down()
  await page.mouse.move(inside.x + 30, inside.y + 6, { steps: 3 })
  await page.mouse.move(outside.x, outside.y, { steps: 6 })
  await expect.poll(() => app.windows().length).toBe(2)
  const torn = app.windows().find((w) => w !== page)!
  await page.mouse.move(outside.x - 100, outside.y + 50, { steps: 4 })
  await torn.waitForFunction(() => window.__moruTest?.ready() === true)
  await page.mouse.up()

  await expect.poll(() => torn.evaluate(() => window.__moruTest!.doc())).toBe('torn off')
  await expect.poll(() => page.evaluate(() => window.__moruTest!.doc())).toBe('')
  expect(await tabs()).toEqual(['untitled'])
  const [sourceBounds, tornBounds] = await Promise.all([
    page.evaluate(() => ({ x: window.screenX, y: window.screenY })),
    torn.evaluate(() => ({ x: window.screenX, y: window.screenY })),
  ])
  expect(tornBounds.x).toBeLessThan(sourceBounds.x)
  await app.close()
})
