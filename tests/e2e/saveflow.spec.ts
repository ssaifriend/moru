import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp } from './launch'

const titles = (page: import('@playwright/test').Page) => page.evaluate(() => window.__moruTest!.tabs()[0]?.tabs.map((t) => t.title))

test('saving an untitled buffer renames its tab, records the path and clears dirty', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'moru-saveflow-'))
  const target = join(dir, 'named.txt')
  const { app, page } = await launchApp({ MORU_TEST_SAVE_PATH: target })
  await page.evaluate(() => window.__moruTest!.focus())
  await page.keyboard.type('hello')
  await expect.poll(() => page.evaluate(() => window.__moruTest!.dirty())).toBe(true)

  await page.evaluate(() => window.__moruTest!.runCommand('file.save'))

  await expect.poll(() => titles(page)).toEqual(['named.txt'])
  expect(await page.evaluate(() => window.__moruTest!.path())).toBe(target)
  expect(await page.evaluate(() => window.__moruTest!.dirty())).toBe(false)
  expect(readFileSync(target, 'utf8')).toBe('hello')
  await expect(page.locator('.tab-title').first()).toHaveText('named.txt')
  await expect.poll(() => page.title()).toContain('named.txt')
  await app.close()
})

test('saving inside a torn-off window renames that tab too', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'moru-saveflow-torn-'))
  const target = join(dir, 'torn.txt')
  const { app, page } = await launchApp({ MORU_TEST_SAVE_PATH: target })
  await page.evaluate(() => window.__moruTest!.focus())
  await page.keyboard.type('torn text')
  const second = app.waitForEvent('window')
  await page.evaluate(() => window.__moruTest!.runCommand('tab.moveToNewWindow'))
  const page2 = await second
  await page2.waitForFunction(() => window.__moruTest?.ready() === true)
  await expect.poll(() => page2.evaluate(() => window.__moruTest!.dirty())).toBe(true)

  await page2.evaluate(() => window.__moruTest!.runCommand('file.save'))

  await expect.poll(() => titles(page2)).toEqual(['torn.txt'])
  expect(await page2.evaluate(() => window.__moruTest!.dirty())).toBe(false)
  expect(readFileSync(target, 'utf8')).toBe('torn text')
  await expect(page2.locator('.tab-title').first()).toHaveText('torn.txt')
  await app.close()
})

test('closing a dirty tab asks first: cancel keeps it, save writes it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'moru-saveflow-close-'))
  const target = join(dir, 'closed.txt')
  const cancel = await launchApp({ MORU_TEST_CONFIRM: 'cancel' })
  await cancel.page.evaluate(() => window.__moruTest!.focus())
  await cancel.page.keyboard.type('keep')
  await cancel.page.evaluate(() => window.__moruTest!.runCommand('tab.close'))
  await cancel.page.waitForTimeout(300)
  expect(await cancel.page.evaluate(() => window.__moruTest!.doc())).toBe('keep')
  await cancel.app.close()

  const save = await launchApp({ MORU_TEST_CONFIRM: 'save', MORU_TEST_SAVE_PATH: target })
  await save.page.evaluate(() => window.__moruTest!.focus())
  await save.page.keyboard.type('write me')
  await save.page.evaluate(() => window.__moruTest!.runCommand('tab.close'))
  await expect.poll(() => readFileSync(target, 'utf8')).toBe('write me')
  await expect.poll(() => titles(save.page)).toEqual(['untitled'])
  expect(await save.page.evaluate(() => window.__moruTest!.doc())).toBe('')
  await save.app.close()
})
