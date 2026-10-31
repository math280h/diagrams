import { expect, test, type Request } from '@playwright/test'
import { copyTemplate } from './helpers'

const MARKER = 'Quokka ledger 7731'
const ALLOWED_HOSTS = new Set(['127.0.0.1:5173', 'api.github.com'])

test('tells on the landing page that diagrams stay on the computer', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Your diagrams are stored only on your computer. No account needed.')).toBeVisible()
  const section = page.getByRole('region', { name: 'Your diagrams stay on your computer' })
  await expect(section.getByRole('heading', { level: 3 })).toHaveText([
    'No server stores your diagrams',
    'Share links without an upload',
    'Exports made on your device',
    'No account',
  ])
})

test('sends no diagram over the network while a person edits, shares and exports it', async ({ page }) => {
  const requests: Request[] = []
  page.on('request', (request) => requests.push(request))
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByLabel('Diagram name').fill(MARKER)
  await page.getByLabel('Diagram name').press('Enter')
  await page.locator('.react-flow__node', { hasText: 'API gateway' }).click()
  await page.getByRole('group', { name: 'Name' }).getByRole('textbox').fill(MARKER)

  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: 'Share link' }).click()
  await expect(page.getByRole('textbox', { name: 'Share link' })).toHaveValue(/#\/s\//, { timeout: 15_000 })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: /Image/ }).click()
  await expect(page.getByAltText('Export preview')).toBeVisible({ timeout: 20_000 })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export PNG' }).click()
  await download

  expect(requests.length).toBeGreaterThan(0)
  for (const request of requests) {
    const url = new URL(request.url())
    if (url.protocol === 'data:' || url.protocol === 'blob:') continue
    expect(ALLOWED_HOSTS, request.url()).toContain(url.host)
    expect(decodeURIComponent(request.url())).not.toContain(MARKER)
    expect(request.postData() ?? '').not.toContain(MARKER)
    if (url.host !== '127.0.0.1:5173') expect(request.method()).toBe('GET')
  }
})
