import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp } from './launch'

// the red close button: a native close that raises the window's close event (renderer window.close() bypasses it)
const nativeClose = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const newest = BrowserWindow.getAllWindows().reduce((a, b) => (a.id > b.id ? a : b))
    newest.close()
  })

const secondWindow = async (app: ElectronApplication, page: Page): Promise<Page> => {
  const second = app.waitForEvent('window')
  await page.evaluate(() => window.__moruTest!.runCommand('window.new'))
  const page2 = await second
  await page2.waitForFunction(() => window.__moruTest?.ready() === true)
  await page2.evaluate(() => window.__moruTest!.focus())
  return page2
}

test('closing a window with an unsaved buffer asks first and cancel keeps it open', async () => {
  const { app, page } = await launchApp({ MORU_TEST_CONFIRM: 'cancel' })
  const page2 = await secondWindow(app, page)
  await page2.keyboard.type('unsaved here')

  await nativeClose(app)
  await page.waitForTimeout(600)
  expect(app.windows().length).toBe(2)
  expect(await page2.evaluate(() => window.__moruTest!.doc())).toBe('unsaved here')
  await app.close()
})

test('choosing save on window close writes the file before the window goes', async () => {
  const target = join(mkdtempSync(join(tmpdir(), 'moru-closewin-')), 'kept.txt')
  const { app, page } = await launchApp({ MORU_TEST_CONFIRM: 'save', MORU_TEST_SAVE_PATH: target })
  const page2 = await secondWindow(app, page)
  await page2.keyboard.type('write on close')

  await nativeClose(app)
  await expect.poll(() => app.windows().length).toBe(1)
  expect(readFileSync(target, 'utf8')).toBe('write on close')
  await app.close()
})

test("don't save on window close discards the text for good", async () => {
  const first = await launchApp()
  const page2 = await secondWindow(first.app, first.page)
  await page2.keyboard.type('discard me')
  await page2.waitForTimeout(1500)

  await nativeClose(first.app)
  await expect.poll(() => first.app.windows().length).toBe(1)
  await first.app.close()

  const second = await launchApp({}, { userData: first.userData })
  await expect.poll(() => second.app.windows().length).toBe(1)
  expect(await second.page.evaluate(() => window.__moruTest!.tabs().flatMap((p) => p.tabs.map((t) => t.title)))).toEqual(['untitled'])
  expect(await second.page.evaluate(() => window.__moruTest!.doc())).toBe('')
  await second.app.close()
})

test('closing the last window quits through hot exit, so the session comes back', async () => {
  const first = await launchApp()
  await first.page.evaluate(() => window.__moruTest!.focus())
  await first.page.keyboard.type('hot exit keeps me')
  await first.page.waitForTimeout(1500)

  const exited = first.app.waitForEvent('close')
  await nativeClose(first.app)
  await exited

  const second = await launchApp({}, { userData: first.userData })
  await expect.poll(() => second.page.evaluate(() => window.__moruTest!.doc())).toBe('hot exit keeps me')
  await second.app.close()
})
