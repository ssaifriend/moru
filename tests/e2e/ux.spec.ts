import { test, expect } from '@playwright/test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { launchApp } from './launch'

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'

const project = () => {
  const root = mkdtempSync(join(tmpdir(), 'moru-ux-'))
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src', 'a.ts'), 'see ./b.ts:2:3 and ../README.md\n')
  writeFileSync(join(root, 'src', 'b.ts'), 'line one\nline two here\n')
  writeFileSync(join(root, 'README.md'), '# r\n')
  return root
}

test('closing the last tab leaves an untitled buffer; status bar shows a root-relative path at fixed height', async () => {
  const root = project()
  const { app, page } = await launchApp({ MORU_TEST_ROOT: root, MORU_TEST_OPEN: join(root, 'src', 'a.ts') })
  await expect(page.getByTestId('path')).toHaveText(join('src', 'a.ts'))
  const height = await page.evaluate(() => document.querySelector('.statusbar')!.getBoundingClientRect().height)
  expect(Math.round(height)).toBe(24)

  await page.evaluate(() => window.__moruTest!.runCommand('tab.close'))
  await expect.poll(async () => (await page.evaluate(() => window.__moruTest!.tabs()))[0]?.tabs.map((t) => t.title)).toEqual(['untitled'])
  await expect(page.getByTestId('path')).toHaveText('untitled')
  await app.close()
})

test('sidebar rows carry icons and highlight the active file', async () => {
  const root = project()
  const { app, page } = await launchApp({ MORU_TEST_ROOT: root, MORU_TEST_OPEN: join(root, 'README.md') })
  await expect(page.locator('.tree-row .tree-icon.dir')).toHaveCount(1)
  await expect(page.locator('.tree-row .tree-icon:not(.dir)')).toHaveCount(1)
  await expect(page.getByTestId('tree-row').filter({ hasText: 'README.md' })).toHaveClass(/active/)
  const rowHeight = await page.getByTestId('tree-row').first().evaluate((el) => el.getBoundingClientRect().height)
  expect(Math.round(rowHeight)).toBe(24)
  await app.close()
})

test('mod+click on a path-like token opens the file at the referenced line', async () => {
  const root = project()
  const { app, page } = await launchApp({ MORU_TEST_ROOT: root, MORU_TEST_OPEN: join(root, 'src', 'a.ts') })
  await expect(page.locator('.cm-path-link')).toHaveCount(2)

  await page.locator('.cm-path-link').first().click({ modifiers: [modifier] })
  await expect.poll(() => page.evaluate(() => window.__moruTest!.path())).toBe(join(root, 'src', 'b.ts'))
  await expect(page.getByTestId('pos')).toHaveText('Ln 2, Col 3')

  await page.evaluate(() => window.__moruTest!.runCommand('tab.prev'))
  await expect.poll(() => page.evaluate(() => window.__moruTest!.path())).toBe(join(root, 'src', 'a.ts'))
  await page.locator('.cm-path-link').nth(1).click({ modifiers: [modifier] })
  await expect.poll(() => page.evaluate(() => window.__moruTest!.path())).toBe(join(root, 'README.md'))
  await app.close()
})

test('sidebar shows file-type badges and its width is draggable and persisted', async () => {
  const root = project()
  const first = await launchApp({ MORU_TEST_ROOT: root, MORU_TEST_OPEN: join(root, 'README.md') })
  await expect(first.page.getByTestId('tree-row').filter({ hasText: 'README.md' }).locator('.tree-badge')).toHaveText('MD')
  await first.page.getByTestId('tree-row').filter({ hasText: 'src' }).click()
  await expect(first.page.getByTestId('tree-row').filter({ hasText: 'a.ts' }).locator('.tree-badge')).toHaveText('TS')

  const width = () => first.page.evaluate(() => document.querySelector('[data-testid="sidebar"]')!.getBoundingClientRect().width)
  const initial = Math.round(await width())
  expect(initial).toBeGreaterThanOrEqual(240)
  expect(initial).toBeLessThanOrEqual(242)
  const gutter = first.page.getByTestId('sidebar-gutter')
  const box = (await gutter.boundingBox())!
  await first.page.mouse.move(box.x + box.width / 2, box.y + 100)
  await first.page.mouse.down()
  await first.page.mouse.move(box.x + box.width / 2 + 60, box.y + 100, { steps: 6 })
  await first.page.mouse.up()
  await expect.poll(async () => Math.round(await width())).toBe(initial + 60)
  await first.page.waitForTimeout(1200)
  await first.app.close()

  const second = await launchApp({ MORU_TEST_ROOT: root }, { userData: first.userData })
  await expect.poll(() => second.page.evaluate(() => document.querySelector('[data-testid="sidebar"]')!.getBoundingClientRect().width).then(Math.round)).toBe(initial + 60)
  await second.app.close()
})

test('the folder view only appears once a folder is open', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'moru-ux-'))
  writeFileSync(join(dir, 'lone.txt'), 'x\n')
  const { app, page } = await launchApp({ MORU_TEST_OPEN: join(dir, 'lone.txt') })
  await expect(page.getByTestId('sidebar')).toHaveCount(0)
  await page.evaluate(() => window.__moruTest!.runCommand('sidebar.toggle'))
  await expect(page.getByTestId('sidebar')).toHaveCount(0)
  await app.close()
})

test('each tab keeps its own scroll position and the window title follows the active tab', async () => {
  const root = project()
  const long = join(root, 'long.ts')
  writeFileSync(long, Array.from({ length: 300 }, (_, i) => `const v${i} = ${i}`).join('\n') + '\n')
  const { app, page } = await launchApp({ MORU_TEST_ROOT: root, MORU_TEST_OPEN: [long, join(root, 'README.md')].join(process.platform === 'win32' ? ';' : ':') })
  await expect.poll(() => page.title()).toBe(`README.md — ${basename(root)}`)

  await page.evaluate(() => window.__moruTest!.runCommand('tab.select', 1))
  await expect.poll(() => page.title()).toContain('long.ts')
  await page.evaluate(() => window.__moruTest!.gotoLineTop(200))
  await expect.poll(() => page.evaluate(() => window.__moruTest!.scrollTop())).toBeGreaterThan(1000)
  const scrolled = await page.evaluate(() => window.__moruTest!.scrollTop())

  await page.evaluate(() => window.__moruTest!.runCommand('tab.select', 2))
  await expect.poll(() => page.evaluate(() => window.__moruTest!.scrollTop())).toBe(0)
  await page.evaluate(() => window.__moruTest!.runCommand('tab.select', 1))
  // restored by top visible line, so allow up to one line of pixel drift
  await expect.poll(() => page.evaluate(() => window.__moruTest!.scrollTop()).then((v) => Math.abs(v - scrolled) <= 24)).toBe(true)

  await page.evaluate(() => window.__moruTest!.focus())
  await page.keyboard.type('x')
  await expect.poll(() => page.title()).toContain('long.ts •')
  await app.close()
})
