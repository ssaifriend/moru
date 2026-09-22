import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { launchApp } from './launch'

const dropUris = async (page: Page, selector: string, uris: readonly string[]) => {
  const transfer = await page.evaluateHandle((list) => {
    const dt = new DataTransfer()
    dt.setData('text/uri-list', list)
    return dt
  }, uris.join('\r\n'))
  await page.locator(selector).first().dispatchEvent('drop', { dataTransfer: transfer })
}

test('a file dropped on the editor opens as a tab instead of pasting its text', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'moru-drop-'))
  const path = join(dir, 'dropped 한글.ts')
  writeFileSync(path, 'const dropped = 1\n')
  const { app, page } = await launchApp()
  await page.evaluate(() => window.__moruTest!.focus())
  await page.keyboard.type('keep me')

  await dropUris(page, '.cm-content', [pathToFileURL(path).href])

  await expect.poll(() => page.evaluate(() => window.__moruTest!.tabs()[0]?.tabs.map((t) => t.title))).toEqual(['untitled', 'dropped 한글.ts'])
  expect(await page.evaluate(() => window.__moruTest!.doc())).toBe('const dropped = 1\n')
  await page.evaluate(() => window.__moruTest!.runCommand('tab.select', 1))
  await expect.poll(() => page.evaluate(() => window.__moruTest!.doc())).toBe('keep me')
  await app.close()
})

test('a folder dropped on the window becomes the project', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'moru-drop-root-'))
  writeFileSync(join(dir, 'a.txt'), 'a\n')
  const { app, page } = await launchApp()
  expect(await page.evaluate(() => window.__moruTest!.projectRoot())).toBeNull()

  await dropUris(page, '.pane', [pathToFileURL(dir).href])

  await expect.poll(() => page.evaluate(() => window.__moruTest!.projectRoot())).toBe(dir)
  await expect(page.getByTestId('sidebar')).toBeVisible()
  await app.close()
})

test('a file dropped on the terminal types its quoted path', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'moru-drop-term-'))
  const path = join(dir, 'a b.txt')
  writeFileSync(path, 'x\n')
  const { app, page } = await launchApp()
  await page.evaluate(() => window.__moruTest!.runCommand('terminal.new'))
  await expect.poll(() => page.evaluate(() => window.__moruTest!.terminals().length)).toBe(1)

  await dropUris(page, '.terminal-host', [pathToFileURL(path).href])

  await expect.poll(() => page.evaluate(() => window.__moruTest!.terminalText()), { timeout: 10_000 }).toContain(`"${path}"`)
  expect(await page.evaluate(() => window.__moruTest!.tabs()[0]?.tabs.length)).toBe(2)
  await app.close()
})
