import { test, expect, type Page } from '@playwright/test'
import { resolve } from 'node:path'
import { launchApp } from './launch'

const fixture = resolve('tests/e2e/fixtures/ime.ts')
const panes = (page: Page) => page.evaluate(() => window.__moruTest!.tabs())

test('split right creates an empty active pane; opening a file lands there; single pane merges back', async () => {
  const { app, page } = await launchApp({ MORU_TEST_OPEN: fixture })
  await expect.poll(async () => (await panes(page)).length).toBe(1)

  await page.evaluate(() => window.__moruTest!.runCommand('view.splitRight'))
  await expect.poll(async () => (await panes(page)).length).toBe(2)
  const after = await panes(page)
  expect(after[1]?.active).toBe(true)
  expect(after[1]?.tabs).toEqual([])
  await expect(page.locator('.pane')).toHaveCount(2)

  await page.evaluate(() => window.__moruTest!.runCommand('file.new'))
  await expect.poll(async () => (await panes(page))[1]?.tabs.map((t) => t.title)).toEqual(['untitled'])

  await page.evaluate(() => window.__moruTest!.runCommand('view.focusPane', 1))
  await expect.poll(async () => (await panes(page))[0]?.active).toBe(true)

  await page.evaluate(() => window.__moruTest!.runCommand('view.singlePane'))
  await expect.poll(async () => (await panes(page)).length).toBe(1)
  expect((await panes(page))[0]?.tabs.map((t) => t.title)).toEqual(['ime.ts', 'untitled'])

  await app.close()
})

test('split down nests a column split and closing the pane collapses it', async () => {
  const { app, page } = await launchApp({ MORU_TEST_OPEN: fixture })

  await page.evaluate(() => window.__moruTest!.runCommand('view.splitRight'))
  await page.evaluate(() => window.__moruTest!.runCommand('view.splitDown'))
  await expect.poll(async () => (await panes(page)).length).toBe(3)
  await expect(page.locator('.split.col')).toHaveCount(1)

  await page.evaluate(() => window.__moruTest!.runCommand('view.closePane'))
  await expect.poll(async () => (await panes(page)).length).toBe(2)
  await page.evaluate(() => window.__moruTest!.runCommand('view.closePane'))
  await expect.poll(async () => (await panes(page)).length).toBe(1)
  await page.evaluate(() => window.__moruTest!.runCommand('view.closePane'))
  expect((await panes(page)).length).toBe(1)

  await app.close()
})

test('the split gutter resizes panes while the mouse drifts off it', async () => {
  const { app, page } = await launchApp()
  await page.evaluate(() => window.__moruTest!.runCommand('view.splitRight'))
  await page.waitForTimeout(300)
  const widths = () => page.evaluate(() => Array.from(document.querySelectorAll('.pane')).map((p) => Math.round(p.getBoundingClientRect().width)))
  const before = await widths()
  const box = (await page.locator('.split .gutter.row').first().boundingBox())!
  await page.mouse.move(box.x + 3, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 3 + 120, box.y + 260, { steps: 12 })
  await page.mouse.up()
  const after = await widths()
  expect(after[0]! - before[0]!).toBeGreaterThan(100)
  expect(await page.locator('.drag-overlay').count()).toBe(0)
  await app.close()
})
