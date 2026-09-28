import { _electron as electron, test, type ElectronApplication, type Page } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export type Launched = { readonly app: ElectronApplication; readonly page: Page; readonly userData: string }

const launched = new Set<ElectronApplication>()

// a hard kill must take the renderer, GPU and utility children with it: on Windows they would otherwise
// outlive the main process holding the worker's stdio pipes, and the worker teardown would hang
const killTree = (app: ElectronApplication): void => {
  const pid = app.process().pid
  if (process.platform === 'win32' && pid) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
  else app.process().kill()
}

test.afterEach(async () => {
  const leaked = [...launched]
  launched.clear()
  await Promise.all(
    leaked.map((app) =>
      Promise.race([
        app.close().catch(() => undefined),
        new Promise((r) => setTimeout(r, 5000)).then(() => {
          // a quit that hangs (seen on Windows CI with a live conpty) must not stall the worker
          killTree(app)
        }),
      ]),
    ),
  )
})

export const launchApp = async (
  env: Record<string, string> = {},
  options: { readonly userData?: string } = {},
): Promise<Launched> => {
  const userData = options.userData ?? mkdtempSync(join(tmpdir(), 'moru-e2e-'))

  const app = await electron.launch({
    args: [resolve('out/main/index.js')],
    env: { ...process.env, MORU_TEST: '1', MORU_HIDDEN: '1', MORU_USER_DATA: userData, ...env },
  })

  launched.add(app)
  app.on('close', () => launched.delete(app))

  const page = await app.firstWindow()
  await page.waitForSelector('#root')
  await page.waitForFunction(() => window.__moruTest?.ready() === true)

  return { app, page, userData }
}
