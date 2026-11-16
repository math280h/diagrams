import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Decrypter, generateX25519Identity, identityToRecipient } from 'age-encryption'
import { build, preview, type PreviewServer } from 'vite'
import { decodeBundle } from '@/reports/bundle'
import { reportSchema } from '@/reports/report'
import { expect, test, type Page, type Request } from './fixtures'
import { copyTemplate, freePort } from './helpers'

const BUILD_TIMEOUT_MS = 240_000
const SEND_TIMEOUT_MS = 60_000
const MARKER = 'Wombat treasury 4417'
const POW_SECRET = 'e2e-proof-of-work-secret-with-32-characters'
const REPORT_ENV = ['DIAGRAMS_REPORT_URL', 'DIAGRAMS_REPORT_KEYS'] as const

async function untilHealthy(url: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw new Error(`The report server at ${url} did not start.`)
}

async function withReportEnv<T>(values: Record<(typeof REPORT_ENV)[number], string>, task: () => Promise<T>) {
  const before = REPORT_ENV.map((name) => [name, process.env[name]] as const)
  Object.assign(process.env, values)
  try {
    return await task()
  } finally {
    for (const [name, value] of before) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

async function throwUncaught(page: Page, message: string) {
  await page.evaluate((text) => {
    setTimeout(() => {
      throw new Error(text)
    })
  }, message)
}

async function openProblemReports(page: Page) {
  await page.keyboard.press('Control+k')
  await page.getByPlaceholder('Search for an action').fill('Problem reports')
  await page.getByRole('option', { name: 'Problem reports' }).click()
  return page.getByRole('dialog', { name: 'Problem reports' })
}

test.describe('problem reports in a build without a report server', () => {
  test('shows the report text and sends nothing', async ({ page }) => {
    const requests: Request[] = []
    page.on('request', (request) => requests.push(request))
    await page.goto('/')
    await copyTemplate(page, 'Order system')
    await page.getByLabel('Diagram name').fill(MARKER)
    await page.getByLabel('Diagram name').press('Enter')
    await throwUncaught(page, `Could not draw ${MARKER}`)

    const list = await openProblemReports(page)
    const problems = list.getByRole('list', { name: 'Problems in this session' })
    await expect(problems).toContainText('The app hit an unexpected error')
    await expect(list.getByRole('heading', { name: 'Sent reports' })).toBeHidden()
    await problems.getByRole('button', { name: 'Report' }).click()

    const dialog = page.getByRole('dialog', { name: 'Report this problem' })
    const text = dialog.getByLabel('Report text')
    await expect(text).toContainText('"kind": "error"')
    await expect(text).toContainText('Could not draw [removed]')
    await expect(text).not.toContainText(MARKER)
    await dialog.getByLabel('What did you do before the problem? (optional)').fill('I drew a flow.')
    await expect(text).toContainText('"note": "I drew a flow."')
    await expect(dialog).toContainText('This build sends no reports.')
    await expect(dialog.getByRole('button', { name: 'Send report' })).toBeHidden()
    await expect(dialog.getByRole('button', { name: 'Save encrypted file' })).toBeHidden()

    const appHost = new URL(page.url()).host
    for (const request of requests) {
      const url = new URL(request.url())
      if (url.protocol === 'data:' || url.protocol === 'blob:') continue
      expect([appHost, 'api.github.com'], request.url()).toContain(url.host)
    }
  })
})

test.describe('problem reports in a build with a report server', () => {
  test.describe.configure({ mode: 'serial' })

  let root = ''
  let reportsDir = ''
  let identity = ''
  let server: ChildProcess | null = null
  let site: PreviewServer | null = null
  let siteUrl = ''

  test.beforeAll(async () => {
    test.setTimeout(BUILD_TIMEOUT_MS)
    root = await mkdtemp(path.join(os.tmpdir(), 'diagrams-reports-'))
    reportsDir = path.join(root, 'reports')
    identity = await generateX25519Identity()
    const [serverPort, sitePort] = [await freePort(), await freePort()]
    const reportUrl = `http://127.0.0.1:${serverPort}`

    await build({
      configFile: path.resolve('report-server/vite.config.ts'),
      logLevel: 'warn',
      build: { outDir: path.join(root, 'server') },
    })
    server = spawn(process.execPath, [path.join(root, 'server', 'server.js')], {
      env: {
        ...process.env,
        PORT: String(serverPort),
        HOST: '127.0.0.1',
        STORAGE: 'fs',
        FS_DIR: reportsDir,
        POW_PROVIDER: 'altcha',
        POW_SECRET,
        ALLOWED_ORIGINS: `http://127.0.0.1:${sitePort}`,
      },
      stdio: 'ignore',
    })
    await untilHealthy(`${reportUrl}/v1/health`)

    const outDir = path.join(root, 'site')
    await withReportEnv(
      { DIAGRAMS_REPORT_URL: reportUrl, DIAGRAMS_REPORT_KEYS: await identityToRecipient(identity) },
      () => build({ logLevel: 'warn', build: { outDir, emptyOutDir: true } }),
    )
    site = await preview({
      logLevel: 'warn',
      build: { outDir },
      preview: { host: '127.0.0.1', port: sitePort, strictPort: true },
    })
    siteUrl = site.resolvedUrls!.local[0]!
  })

  test.afterAll(async () => {
    await site?.close()
    server?.kill()
    if (root) await rm(root, { recursive: true, force: true })
  })

  const storedReports = async () => {
    try {
      return (await readdir(reportsDir)).filter((name) => name.endsWith('.age'))
    } catch {
      return []
    }
  }

  test('sends an encrypted report with a proof of work, and deletes it from the server', async ({ page }) => {
    test.setTimeout(SEND_TIMEOUT_MS * 2)
    const violations: string[] = []
    page.on('console', (message) => {
      if (message.text().includes('Content Security Policy')) violations.push(message.text())
    })
    await page.goto(siteUrl)
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
      'content',
      new RegExp(`connect-src [^;]*${new URL(siteUrl).hostname.replaceAll('.', '\\.')}:\\d+`),
    )
    await copyTemplate(page, 'Order system')
    await page.getByLabel('Diagram name').fill(MARKER)
    await page.getByLabel('Diagram name').press('Enter')
    await throwUncaught(page, `Could not draw ${MARKER}`)

    const list = await openProblemReports(page)
    await expect(list.getByText('You sent no reports from this device.')).toBeVisible()
    await list.getByRole('list', { name: 'Problems in this session' }).getByRole('button', { name: 'Report' }).click()
    const dialog = page.getByRole('dialog', { name: 'Report this problem' })
    await dialog.getByLabel('What did you do before the problem? (optional)').fill('I renamed the diagram.')
    const previewText = (await dialog.getByLabel('Report text').textContent()) ?? ''
    expect(previewText).toContain('"note": "I renamed the diagram."')
    await dialog.getByRole('button', { name: 'Send report' }).click()

    const sent = page.getByRole('dialog', { name: 'Report sent' })
    await expect(sent).toBeVisible({ timeout: SEND_TIMEOUT_MS })
    const [file] = await storedReports()
    expect(file).toBeDefined()
    await expect(sent).toContainText(file!.replace(/\.age$/, ''))

    const decrypter = new Decrypter()
    decrypter.addIdentity(identity)
    const bundle = decodeBundle(await decrypter.decrypt(new Uint8Array(await readFile(path.join(reportsDir, file!)))))
    expect(bundle.json).toBe(previewText)
    expect(bundle.dump).toBeNull()
    expect(bundle.json).not.toContain(MARKER)
    expect(reportSchema.parse(JSON.parse(bundle.json))).toMatchObject({ kind: 'error', app: { surface: 'website' } })

    await sent.getByRole('button', { name: 'Problem reports' }).click()
    const reports = page.getByRole('dialog', { name: 'Problem reports' }).getByRole('list', { name: 'Sent reports' })
    await expect(reports).toContainText('The app hit an unexpected error')
    await reports.getByRole('button', { name: 'Delete from server' }).click()
    await expect(page.getByText('Deleted the report from the report server')).toBeVisible()
    await expect(page.getByText('You sent no reports from this device.')).toBeVisible()
    expect(await storedReports()).toEqual([])
    expect(violations).toEqual([])
  })

  test('saves a report as a file that only the maintainers can read', async ({ page }) => {
    await page.goto(siteUrl)
    await copyTemplate(page, 'Order system')
    const list = await openProblemReports(page)
    await list.getByRole('button', { name: 'Describe a problem' }).click()
    const dialog = page.getByRole('dialog', { name: 'Describe a problem' })
    await expect(dialog.getByRole('button', { name: 'Send report' })).toBeDisabled()
    await dialog.getByLabel('What is the problem?').fill('The canvas flickers.')
    const download = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Save encrypted file' }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^diagrams-report-\d{4}-\d{2}-\d{2}\.age$/)
    const decrypter = new Decrypter()
    decrypter.addIdentity(identity)
    const bundle = decodeBundle(await decrypter.decrypt(new Uint8Array(await readFile(await file.path()))))
    expect(JSON.parse(bundle.json)).toMatchObject({ kind: 'note', note: 'The canvas flickers.' })
  })
})
