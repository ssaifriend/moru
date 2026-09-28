import { test, expect } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp } from './launch'

const project = () => {
  const root = mkdtempSync(join(tmpdir(), 'moru-proj-'))
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src', 'index.ts'), 'export const x = 1\n')
  writeFileSync(join(root, 'README.md'), '# hi\n')
  return root
}

test('sidebar lists the project root, expands directories, opens files', async () => {
  const root = project()
  const { app, page } = await launchApp({ MORU_TEST_ROOT: root })
  await expect(page.getByTestId('sidebar')).toBeVisible()
  const names = page.getByTestId('tree-row').locator('.tree-name')
  await expect(names).toHaveText(['src', 'README.md'])

  await page.getByTestId('tree-row').filter({ hasText: 'src' }).click()
  await expect(names).toHaveText(['src', 'index.ts', 'README.md'])

  await page.getByTestId('tree-row').filter({ hasText: 'index.ts' }).click()
  await expect.poll(() => page.evaluate(() => window.__moruTest!.doc())).toBe('export const x = 1\n')
  await expect(page.getByTestId('path')).toHaveText(join('src', 'index.ts'))

  await page.evaluate(() => window.__moruTest!.runCommand('sidebar.toggle'))
  await expect(page.getByTestId('sidebar')).toBeHidden()
  await app.close()
})

test('new file, rename and delete refresh the tree and keep buffers consistent', async () => {
  const root = project()
  const { app, page } = await launchApp({ MORU_TEST_ROOT: root })

  await page.evaluate((r) => window.__moruTest!.runCommand('sidebar.newFile', { dir: r, name: 'notes.md' }), root)
  await expect(page.getByTestId('tree-row').filter({ hasText: 'notes.md' })).toHaveCount(1)
  expect(existsSync(join(root, 'notes.md'))).toBe(true)
  await expect.poll(() => page.evaluate(() => window.__moruTest!.path())).toBe(join(root, 'notes.md'))

  await page.evaluate((r) => window.__moruTest!.runCommand('sidebar.rename', { path: r, name: 'todo.md' }), join(root, 'notes.md'))
  await expect(page.getByTestId('tree-row').filter({ hasText: 'todo.md' })).toHaveCount(1)
  await expect.poll(() => page.evaluate(() => window.__moruTest!.path())).toBe(join(root, 'todo.md'))

  await page.evaluate((r) => window.__moruTest!.runCommand('sidebar.delete', { path: r }), join(root, 'README.md'))
  await expect(page.getByTestId('tree-row').filter({ hasText: 'README.md' })).toHaveCount(0)
  expect(existsSync(join(root, 'README.md'))).toBe(false)
  await app.close()
})

test('terminal cwd is the project root', async () => {
  test.skip(process.platform === 'win32', 'pwd is POSIX')
  const root = project()
  const { app, page } = await launchApp({ MORU_TEST_ROOT: root })
  await page.evaluate(() => window.__moruTest!.runCommand('terminal.new'))
  await page.evaluate(() => window.__moruTest!.terminalFocus())
  await page.keyboard.type('pwd\n')
  await expect
    .poll(() => page.evaluate(() => window.__moruTest!.terminalText()), { timeout: 10_000 })
    .toContain(root.replace('/private', ''))
  await app.close()
})

test('the folder context menu creates and renames through an inline name field', async () => {
  const root = project()
  const { app, page } = await launchApp({ MORU_TEST_ROOT: root })
  const row = (name: string) => page.getByTestId('tree-row').filter({ hasText: name })

  await row('src').click({ button: 'right' })
  await page.getByTestId('popup-item').filter({ hasText: 'New File' }).click()
  const input = page.getByTestId('tree-name-input')
  await expect(input).toBeFocused()
  await input.fill('fresh.ts')
  await input.press('Enter')
  await expect(row('fresh.ts')).toHaveCount(1)
  expect(existsSync(join(root, 'src', 'fresh.ts'))).toBe(true)
  await expect.poll(() => page.evaluate(() => window.__moruTest!.path())).toBe(join(root, 'src', 'fresh.ts'))

  await row('README.md').click({ button: 'right' })
  await page.getByTestId('popup-item').filter({ hasText: 'Rename' }).click()
  await expect(input).toHaveValue('README.md')
  expect(await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 6])
  await input.fill('GUIDE.md')
  await input.press('Enter')
  await expect(row('GUIDE.md')).toHaveCount(1)
  expect(existsSync(join(root, 'GUIDE.md'))).toBe(true)
  expect(existsSync(join(root, 'README.md'))).toBe(false)

  await row('GUIDE.md').click({ button: 'right' })
  await page.getByTestId('popup-item').filter({ hasText: 'Rename' }).click()
  await input.press('Escape')
  await expect(input).toHaveCount(0)
  await expect(row('GUIDE.md')).toHaveCount(1)
  await app.close()
})

test('the sidebar keeps its width when a deep tree with long names is expanded', async () => {
  const root = mkdtempSync(join(tmpdir(), 'moru-wide-'))
  const deep = join(root, 'a-very-long-directory-name-one', 'another-very-long-directory-name-two', 'yet-another-long-directory-name-three')
  mkdirSync(deep, { recursive: true })
  writeFileSync(join(deep, 'an-extremely-long-file-name-that-does-not-fit-in-the-sidebar-at-all.ts'), 'x\n')
  const { app, page } = await launchApp({ MORU_TEST_ROOT: root })
  const width = async () => Math.round((await page.getByTestId('sidebar').boundingBox())!.width)
  const before = await width()

  for (const name of ['a-very-long-directory-name-one', 'another-very-long-directory-name-two', 'yet-another-long-directory-name-three']) {
    await page.getByTestId('tree-row').filter({ hasText: name }).click()
  }
  await expect(page.getByTestId('tree-row').filter({ hasText: 'an-extremely-long-file-name' })).toHaveCount(1)
  expect(await width()).toBe(before)
  expect(await page.evaluate(() => document.querySelector('.sidebar-tree')!.scrollWidth <= document.querySelector('.sidebar-tree')!.clientWidth + 1)).toBe(true)
  await app.close()
})

test('files created, removed or added as folders outside the app show up in the tree', async () => {
  const root = project()
  const { app, page } = await launchApp({ MORU_TEST_ROOT: root })
  const row = (name: string) => page.getByTestId('tree-row').filter({ hasText: name })
  await row('src').click()
  await expect(row('index.ts')).toHaveCount(1)

  writeFileSync(join(root, 'src', 'outside.ts'), 'x\n')
  writeFileSync(join(root, 'top.txt'), 'y\n')
  mkdirSync(join(root, 'src', 'nested'))
  await expect(row('outside.ts')).toHaveCount(1, { timeout: 15_000 })
  await expect(row('top.txt')).toHaveCount(1, { timeout: 15_000 })
  await expect(row('nested')).toHaveCount(1, { timeout: 15_000 })

  rmSync(join(root, 'src', 'index.ts'))
  await expect(row('index.ts')).toHaveCount(0, { timeout: 15_000 })

  await row('nested').click()
  rmSync(join(root, 'src', 'nested'), { recursive: true })
  await expect(row('nested')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByTestId('status')).not.toContainText('folder failed')
  await app.close()
})
