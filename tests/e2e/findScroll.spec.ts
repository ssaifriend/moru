import { test, expect } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp } from './launch'

test('editing with the find panel open keeps the viewport where it was', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'moru-findscroll-'))
  const path = join(dir, 'long.txt')
  writeFileSync(path, Array.from({ length: 600 }, (_, i) => `line ${i + 1} alpha beta gamma`).join('\n') + '\n')
  const { app, page } = await launchApp({ MORU_TEST_OPEN: path })
  const top = () => page.evaluate(() => window.__moruTest!.scrollTop())
  await page.evaluate(() => window.__moruTest!.focus())
  await page.evaluate(() => window.__moruTest!.gotoLineTop(300))
  await expect.poll(top).toBeGreaterThan(1000)
  const before = await top()

  await page.evaluate(() => window.__moruTest!.runCommand('find.open'))
  await page.getByTestId('find-input').fill('alpha')
  await expect.poll(() => page.evaluate(() => window.__moruTest!.findState().count)).toBe(600)
  expect(await page.locator('.cm-searchMatch').count()).toBeGreaterThan(0)

  const box = (await page.locator('.cm-scroller').boundingBox())!
  await page.mouse.click(box.x + 120, box.y + 150)
  await page.keyboard.type('xyz')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(300)
  expect(Math.abs((await top()) - before)).toBeLessThan(2)
  expect(await page.evaluate(() => window.__moruTest!.doc())).toContain('xyz')
  await app.close()
})
