import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { expect, test, type Page } from './fixtures'
import { build, preview, type PreviewServer } from 'vite'
import {
  AGENT_HOST,
  AGENT_PORT,
  LATEST_RELEASE_API_URL,
  RELEASE_ASSET_URL_PREFIX,
  RELEASES_API_URL,
} from '@/desktop/constants'
import { copyTemplate } from './helpers'

const BUILD_TIMEOUT_MS = 180_000

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() =>
        typeof address === 'object' && address ? resolve(address.port) : reject(new Error('No free port.')),
      )
    })
  })
}

let outDir = ''
let server: PreviewServer | null = null
let siteUrl = ''

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  test.setTimeout(BUILD_TIMEOUT_MS)
  outDir = await mkdtemp(path.join(os.tmpdir(), 'diagrams-csp-'))
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

async function trackViolations(page: Page): Promise<string[]> {
  const violations: string[] = []
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) violations.push(message.text())
  })
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(
        `Content Security Policy: ${event.effectiveDirective} blocked ${event.blockedURI} at ${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`,
      )
    })
  })
  return violations
}

async function serveLatestRelease(page: Page) {
  const name = 'Diagrams-9.9.9-win-x64.exe'
  await page.route(LATEST_RELEASE_API_URL, (route) =>
    route.fulfill({
      json: { assets: [{ name, browser_download_url: `${RELEASE_ASSET_URL_PREFIX}v9.9.9/${name}` }] },
      headers: { 'access-control-allow-origin': '*' },
    }),
  )
}

test('puts the policy in the page, and the library loads the latest release under it', async ({ page }) => {
  const violations = await trackViolations(page)
  await serveLatestRelease(page)
  await page.goto(siteUrl)
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
    'content',
    /script-src 'self';.*connect-src 'self' data: blob: https:\/\/api\.github\.com http:\/\/127\.0\.0\.1:27419/,
  )
  await expect(page.getByRole('link', { name: /^Download for (Windows|macOS|Linux)$/ })).toHaveAttribute(
    'href',
    //releases/download/v9.9.9//,
  )
  await page.route(RELEASES_API_URL, (route) =>
    route.fulfill({
      json: [{ tag_name: 'v9.9.9', name: 'v9.9.9', published_at: '2026-10-28T09:00:00Z', body_html: '<p>Notes</p>' }],
      headers: { 'access-control-allow-origin': '*' },
    }),
  )
  await page.goto(`${siteUrl}#/releases`)
  await expect(page.getByRole('heading', { name: 'What’s new' })).toBeVisible()
  await expect(page.getByRole('article').first()).toBeVisible()
  expect(violations).toEqual([])
})

test('edits, tidies up, exports and presents a diagram under the policy', async ({ page }) => {
  const violations = await trackViolations(page)
  await page.goto(siteUrl)
  await copyTemplate(page, 'Order system')

  const orders = page.locator('[data-editor-canvas] .react-flow__node', { hasText: 'Orders' }).first()
  const before = await orders.getAttribute('style')
  await page.locator('[data-editor-canvas] .react-flow__pane').click({ button: 'right', position: { x: 20, y: 20 } })
  await page.getByRole('menuitem', { name: /Tidy up, top to bottom/ }).click()
  await expect.poll(() => orders.getAttribute('style')).not.toBe(before)

  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: /Image/ }).click()
  await expect(page.getByAltText('Export preview')).toBeVisible({ timeout: 20_000 })
  const imageDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export PNG' }).click()
  const bytes = await readFile(await (await imageDownload).path())
  expect(bytes.subarray(1, 4).toString()).toBe('PNG')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Present' }).click()
  await expect(page.locator('.dg-caption')).toBeVisible()
  expect(violations).toEqual([])
})

test('imports a Mermaid flowchart and exports a GIF under the policy', async ({ page }) => {
  test.setTimeout(120_000)
  const violations = await trackViolations(page)
  await page.goto(siteUrl)
  await page.getByRole('button', { name: 'Import' }).click()
  await page
    .getByRole('dialog')
    .getByRole('textbox')
    .fill('flowchart LR\n  web[Web] --> api[API]\n  api --> db[(Orders)]')
  await page.getByRole('button', { name: 'Import flowchart' }).click()
  await expect(page.locator('[data-editor-canvas] .react-flow__node')).toHaveCount(3)

  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: /Animation/ }).click()
  await page.getByRole('combobox', { name: 'Content' }).click()
  await page.getByRole('option', { name: 'Traffic only, no flow' }).click()
  await page.getByRole('button', { name: 'GIF', exact: true }).click()
  await page.getByRole('group', { name: 'Frame rate' }).getByRole('button', { name: '10 fps' }).click()
  await page.getByRole('slider').fill('2')
  const download = page.waitForEvent('download', { timeout: 85_000 })
  await page.getByRole('button', { name: 'Export GIF' }).click()
  const bytes = await readFile(await (await download).path())
  expect(bytes.subarray(0, 6).toString()).toBe('GIF89a')
  expect(violations).toEqual([])
})

test('makes a share link and reaches the desktop app under the policy', async ({ page }) => {
  const violations = await trackViolations(page)
  const handoffs: string[] = []
  await page.route(`http://${AGENT_HOST}:${AGENT_PORT}/**`, (route) => {
    handoffs.push(route.request().url())
    return route.abort('connectionrefused')
  })
  await page.addInitScript(() => {
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (!this.href.startsWith('diagrams:')) HTMLElement.prototype.click.call(this)
    }
  })
  await page.goto(siteUrl)
  await copyTemplate(page, 'Checkout flow')

  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: 'Share link' }).click()
  await expect(page.getByRole('textbox', { name: 'Share link' })).toHaveValue(/#\/s\/y[\w-]+x$/, { timeout: 15_000 })
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: 'Open in desktop app' }).click()
  await expect.poll(() => handoffs.length).toBeGreaterThan(0)
  expect(violations).toEqual([])
})
