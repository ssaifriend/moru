import { test, expect } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp } from './launch'

const wrapped = (page: import('@playwright/test').Page) => page.evaluate(() => window.__moruTest!.editorSettings().wordWrap)

test('View: Toggle Word Wrap flips wrapping for the active tab only and survives a restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'moru-wrap-'))
  const long = join(dir, 'long.txt')
  writeFileSync(long, `${'word '.repeat(400)}\n`)
  const first = await launchApp({ MORU_TEST_OPEN: long })
  expect(await wrapped(first.page)).toBe(false)

  await first.page.evaluate(() => window.__moruTest!.runCommand('view.toggleWordWrap'))
  await expect.poll(() => wrapped(first.page)).toBe(true)
  await expect(first.page.getByTestId('status')).toContainText('word wrap on')

  await first.page.evaluate(() => window.__moruTest!.runCommand('file.new'))
  await first.page.evaluate(() => window.__moruTest!.focus())
  await first.page.keyboard.type('scratch')
  await expect.poll(() => wrapped(first.page)).toBe(false)
  await first.page.evaluate(() => window.__moruTest!.runCommand('tab.select', 1))
  await expect.poll(() => wrapped(first.page)).toBe(true)

  expect(await first.page.evaluate(() => window.__moruTest!.bindingFor('view.toggleWordWrap'))).toBe('alt+z')
  await first.page.waitForTimeout(1200)
  await first.app.close()

  const second = await launchApp({}, { userData: first.userData })
  await expect.poll(async () => (await second.page.evaluate(() => window.__moruTest!.tabs()))[0]?.tabs.map((t) => t.title)).toEqual(['long.txt', 'untitled'])
  await second.page.evaluate(() => window.__moruTest!.runCommand('tab.select', 1))
  await expect.poll(() => wrapped(second.page)).toBe(true)
  await second.page.evaluate(() => window.__moruTest!.runCommand('tab.select', 2))
  await expect.poll(() => wrapped(second.page)).toBe(false)
  await second.app.close()
})
