import { appendFile, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { build, preview, type PreviewServer } from 'vite'
import type { AssetList } from '@/sw/asset-list'
import { copyTemplate } from './helpers'

const BUILD_TIMEOUT_MS = 180_000
const CACHE_ALL_TIMEOUT_MS = 120_000

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
  outDir = await mkdtemp(path.join(os.tmpdir(), 'diagrams-offline-'))
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

async function assetList(): Promise<AssetList> {
  const file = (await readdir(path.join(outDir, 'assets'))).find((name) => name.startsWith('sw-assets-'))
  return JSON.parse(await readFile(path.join(outDir, 'assets', file!), 'utf8')) as AssetList
}

async function asInstalledApp(context: BrowserContext, { savesData = false } = {}) {
  await context.addInitScript((saveData) => {
    const matchMedia = window.matchMedia.bind(window)
    window.matchMedia = (query) =>
      query === '(display-mode: standalone)'
        ? Object.create(matchMedia(query), { matches: { value: true } })
        : matchMedia(query)
    if (saveData) Object.defineProperty(navigator, 'connection', { value: { saveData: true } })
  }, savesData)
}

async function openWithServiceWorker(page: Page) {
  await page.goto(siteUrl)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
}

function cachedPaths(page: Page, paths: string[]) {
  return page.evaluate(async (wanted) => {
    const cached = new Set<string>()
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) cached.add(new URL(request.url).pathname)
    }
    return wanted.filter((wantedPath) => cached.has(wantedPath)).length
  }, paths)
}

test('gives a browser tab no service worker', async ({ page }) => {
  await page.goto(siteUrl)
  await expect(page.getByRole('heading', { name: 'Keep diagrams with your code' })).toBeAttached()
  await page.waitForLoadState('networkidle')
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0)
  expect(await page.evaluate(() => caches.keys())).toEqual([])
})

test('opens the library, a template and the editor of the installed app without internet', async ({
  page,
  context,
}) => {
  await asInstalledApp(context, { savesData: true })
  await openWithServiceWorker(page)
  const list = await assetList()
  expect(await cachedPaths(page, list.precache)).toBe(list.precache.length)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Keep diagrams with your code' })).toBeAttached()
  await copyTemplate(page, 'Order system')
})

test('fetches every file in the installed app, so that Tidy up works without internet', async ({ page, context }) => {
  test.setTimeout(CACHE_ALL_TIMEOUT_MS + 60_000)
  await asInstalledApp(context)
  await openWithServiceWorker(page)
  const list = await assetList()
  await expect.poll(() => cachedPaths(page, list.all), { timeout: CACHE_ALL_TIMEOUT_MS }).toBe(list.all.length)

  await context.setOffline(true)
  await page.reload()
  await copyTemplate(page, 'Order system')
  const orders = page.locator('[data-editor-canvas] .react-flow__node', { hasText: 'Orders' }).first()
  const before = await orders.getAttribute('style')
  await page.locator('[data-editor-canvas] .react-flow__pane').click({ button: 'right', position: { x: 20, y: 20 } })
  await page.getByRole('menuitem', { name: /Tidy up, top to bottom/ }).click()
  await expect.poll(() => orders.getAttribute('style')).not.toBe(before)
})

test('loads a new version of the page at once while there is internet', async ({ page, context }) => {
  await asInstalledApp(context)
  await openWithServiceWorker(page)
  const indexFile = path.join(outDir, 'index.html')
  const original = await readFile(indexFile, 'utf8')
  try {
    await writeFile(indexFile, original.replace('</head>', '<meta name="build" content="newer" /></head>'))
    await page.reload()
    await expect(page.locator('meta[name="build"]')).toHaveAttribute('content', 'newer')
  } finally {
    await writeFile(indexFile, original)
  }
})

test('removes the files of an earlier build when a new service worker takes over', async ({ browser }) => {
  const context = await browser.newContext()
  // A browser activates a new service worker only after the old one ends its work, such as fetching every file.
  await asInstalledApp(context, { savesData: true })
  const page = await context.newPage()
  await openWithServiceWorker(page)
  await page.evaluate(async () => {
    await (await caches.open('dg-assets')).put('/assets/earlier-build.js', new Response('export {}'))
  })

  await appendFile(path.join(outDir, 'sw.js'), '\n')
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update())
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting !== null))
    .toBe(true)
  await page.close()

  const next = await context.newPage()
  await next.goto(siteUrl)
  await expect
    .poll(() =>
      next.evaluate(
        async () => (await (await caches.open('dg-assets')).match('/assets/earlier-build.js')) === undefined,
      ),
    )
    .toBe(true)
  await context.close()
})
