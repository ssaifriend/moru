import { test, expect } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp } from './launch'

const titles = (page: import('@playwright/test').Page) => page.evaluate(() => window.__moruTest!.tabs()[0]?.tabs.map((t) => t.title))

test('mod+shift+t reopens closed file tabs newest first with cursor and scroll, and survives a restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'moru-reopen-'))
  const a = join(dir, 'a.txt')
  const b = join(dir, 'b.txt')
  writeFileSync(a, `${'line\n'.repeat(400)}`)
  writeFileSync(b, 'bee\n')
  const first = await launchApp({ MORU_TEST_OPEN: `${a}${process.platform === 'win32' ? ';' : ':'}${b}` })
  await expect.poll(() => titles(first.page)).toEqual(['a.txt', 'b.txt'])
  expect(await first.page.evaluate(() => window.__moruTest!.bindingFor('tab.reopenClosed'))).toBe('mod+shift+t')

  await first.page.evaluate(() => window.__moruTest!.runCommand('tab.select', 1))
  await first.page.evaluate(() => window.__moruTest!.gotoLineTop(300))
  await expect.poll(() => first.page.evaluate(() => window.__moruTest!.scrollTop())).toBeGreaterThan(1000)
  await first.page.evaluate(() => window.__moruTest!.setCursor(1500))
  await first.page.evaluate(() => window.__moruTest!.runCommand('tab.close'))
  await expect.poll(() => titles(first.page)).toEqual(['b.txt'])
  await first.page.evaluate(() => window.__moruTest!.runCommand('tab.close'))
  await expect.poll(() => titles(first.page)).toEqual(['untitled'])

  await first.page.evaluate(() => window.__moruTest!.runCommand('tab.reopenClosed'))
  await expect.poll(() => titles(first.page)).toEqual(['untitled', 'b.txt'])
  await first.page.evaluate(() => window.__moruTest!.runCommand('tab.reopenClosed'))
  await expect.poll(() => titles(first.page)).toEqual(['untitled', 'b.txt', 'a.txt'])
  expect(await first.page.evaluate(() => window.__moruTest!.path())).toBe(a)
  expect(await first.page.evaluate(() => window.__moruTest!.selections())).toEqual([{ from: 1500, to: 1500 }])
  await expect.poll(() => first.page.evaluate(() => window.__moruTest!.scrollTop())).toBeGreaterThan(1000)

  await first.page.evaluate(() => window.__moruTest!.runCommand('tab.reopenClosed'))
  await expect(first.page.getByTestId('status')).toContainText('no closed tab')

  await first.page.evaluate(() => window.__moruTest!.runCommand('tab.close'))
  await expect.poll(() => titles(first.page)).toEqual(['untitled', 'b.txt'])
  await first.page.waitForTimeout(1200)
  await first.app.close()

  const second = await launchApp({}, { userData: first.userData })
  await expect.poll(() => titles(second.page)).toEqual(['b.txt'])
  await second.page.evaluate(() => window.__moruTest!.runCommand('tab.reopenClosed'))
  await expect.poll(() => titles(second.page)).toEqual(['b.txt', 'a.txt'])
  await second.app.close()
})
