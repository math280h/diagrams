import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import { expect, test, type Page } from './fixtures'
import { copyTemplate, freePort } from './helpers'

const BUILD_TIMEOUT_MS = 180_000

let outDir = ''
let server: PreviewServer | null = null
let siteUrl = ''

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  test.setTimeout(BUILD_TIMEOUT_MS)
  outDir = await mkdtemp(path.join(os.tmpdir(), 'diagrams-new-version-'))
  await build({ logLevel: 'warn', build: { outDir, emptyOutDir: true } })
  server = await preview({
    logLevel: 'warn',
    build: { outDir },
    preview: { host: '127.0.0.1', port: await freePort(), strictPort: true },
  })
  siteUrl = server.resolvedUrls!.local[0]!
})

test.afterAll(async () => {
  await server?.close()
  if (outDir) await rm(outDir, { recursive: true, force: true })
})

/** Records the files that the page loads, so that a deploy can take away all others. */
function recordLoadedFiles(page: Page): Set<string> {
  const loaded = new Set<string>()
  page.on('requestfinished', (request) => loaded.add(request.url()))
  return loaded
}

/**
 * Acts as a deploy of a new version: the server no longer has the entry script and the files that the page did not
 * load yet. `missingOnce` takes away a file only for its first request, as a reload then gets the new build.
 */
async function deployNewVersion(page: Page, loaded: ReadonlySet<string>, { missingOnce = false } = {}) {
  const kept = new Set(loaded)
  const taken = new Set<string>()
  await page.route('**/assets/**', async (route) => {
    const request = route.request()
    const missing =
      request.method() === 'HEAD' || (!kept.has(request.url()) && !(missingOnce && taken.has(request.url())))
    if (!missing) return route.continue()
    taken.add(request.url())
    return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' })
  })
}

async function openOrderSystem(page: Page) {
  const loaded = recordLoadedFiles(page)
  await page.goto(siteUrl)
  await copyTemplate(page, 'Order system')
  await page.waitForLoadState('networkidle')
  return loaded
}

async function tidyUp(page: Page) {
  await page.locator('[data-editor-canvas] .react-flow__pane').click({ button: 'right', position: { x: 20, y: 20 } })
  await page.getByRole('menuitem', { name: /Tidy up, top to bottom/ }).click()
}

function storedName(page: Page) {
  return page.evaluate(() => {
    const id = /#\/[dp]\/([^/?]+)/.exec(window.location.hash)?.[1]
    const stored = id ? localStorage.getItem(`dg:diagram:${id}`) : null
    return stored ? (JSON.parse(stored) as { name: string }).name : null
  })
}

test('offers a reload after a deploy, asks before it closes a dialog, and keeps the changes', async ({ page }) => {
  const loaded = await openOrderSystem(page)
  await deployNewVersion(page, loaded)
  await tidyUp(page)

  const notice = page.locator('[data-sonner-toast]', { hasText: 'A new version of Diagrams is available' })
  await expect(notice).toBeVisible()
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(1)

  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByRole('menuitem', { name: /Image \(PNG/ }).click()
  await expect(page.getByRole('dialog', { name: 'Export' })).toBeVisible()
  await notice.getByRole('button', { name: 'Reload' }).click()
  const question = page.getByRole('dialog', { name: 'Reload now?' })
  await expect(question).toContainText('The open dialog closes.')
  await question.getByRole('button', { name: 'Stay' }).click()
  await expect(question).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Export' })).toBeHidden()
  await expect(notice).toBeVisible()

  await page.unrouteAll()
  await page.getByLabel('Diagram name').fill('Changed just before the reload')
  await page.getByLabel('Diagram name').press('Enter')
  const reloaded = page.waitForEvent('load')
  await notice.getByRole('button', { name: 'Reload' }).click()
  await reloaded

  await expect(page.getByLabel('Diagram name')).toHaveValue('Changed just before the reload')
  expect(await storedName(page)).toBe('Changed just before the reload')
  const orders = page.locator('[data-editor-canvas] .react-flow__node', { hasText: 'Orders' }).first()
  const before = await orders.getAttribute('style')
  await tidyUp(page)
  await expect.poll(() => orders.getAttribute('style')).not.toBe(before)
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
})

test('shows what failed, without a reload loop, when the reload gets the old version again', async ({ page }) => {
  const loaded = await openOrderSystem(page)
  await deployNewVersion(page, loaded)
  await tidyUp(page)
  const reloaded = page.waitForEvent('load')
  await page.locator('[data-sonner-toast]').getByRole('button', { name: 'Reload' }).click()
  await reloaded
  await expect(page.locator('[data-editor-canvas] .react-flow__node').first()).toBeVisible()

  let reloads = 0
  page.on('load', () => reloads++)
  await tidyUp(page)
  const failure = page.locator('[data-sonner-toast]', { hasText: 'Tidy up failed.' })
  await expect(failure).toContainText('The reload did not get the new version, so a file is still missing.')
  await expect(failure.getByRole('button', { name: 'More details' })).toBeVisible()
  await expect(page.getByText('A new version of Diagrams is available')).toBeHidden()
  expect(reloads).toBe(0)
})

test('reloads once, after the save, to open a page that only the new version has', async ({ page }) => {
  const loaded = await openOrderSystem(page)
  await deployNewVersion(page, loaded, { missingOnce: true })
  let reloads = 0
  page.on('load', () => reloads++)
  await page.getByLabel('Diagram name').fill('Changed before Present')
  await page.getByLabel('Diagram name').press('Enter')
  await page.getByRole('button', { name: 'Present' }).click()

  await expect(page).toHaveTitle('Changed before Present, Present – Diagrams')
  await expect(page.getByRole('button', { name: /Exit presentation/ })).toBeVisible()
  expect(reloads).toBe(1)
  expect(await storedName(page)).toBe('Changed before Present')
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
})
