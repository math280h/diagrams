import { expect, test, type Page } from './fixtures'
import { copyTemplate } from './helpers'

function logRow(page: Page, step: number) {
  return page.locator('.dg-log-row').nth(step - 1)
}

function section(page: Page, title: 'Request body' | 'Response body') {
  return page.locator('section', { has: page.getByRole('heading', { name: title, exact: true }) })
}

test('describes the bodies of a connection, fills them from JSON, copies the example and logs them', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  const label = page.locator('.dg-edge-label', { hasText: 'SQL' })
  const mark = label.locator('.dg-edge-fields')
  await label.click()
  await expect(page.getByRole('complementary', { name: 'Properties' })).toContainText('Connection')

  const request = section(page, 'Request body')
  await request.getByRole('button', { name: 'Add a field' }).click()
  await request.getByRole('group', { name: 'Name' }).getByRole('textbox').fill('orderId')
  await request.getByRole('group', { name: 'Example' }).getByRole('textbox').fill('ord_8f2k')
  await expect(mark).toHaveText('{1}')

  await page.getByRole('button', { name: 'Edit the request body as JSON' }).click()
  const json = page.getByRole('textbox', { name: 'Request body as JSON' })
  await expect(json).toHaveValue('{\n  "orderId": "ord_8f2k"\n}')
  await json.fill('{"orderId": "ord_8f2k", ')
  await page.getByRole('button', { name: 'Use this JSON' }).click()
  await expect(page.getByRole('dialog')).toContainText('This is not valid JSON.')
  await json.fill('{"orderId": "ord_8f2k", "total": 49, "lines": [{"sku": "LAMP-01"}]}')
  await page.getByRole('button', { name: 'Use this JSON' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(request.getByRole('button', { name: /^lines\[\]\.sku, string$/ })).toBeVisible()
  await expect(mark).toHaveText('{4}')

  await page.getByRole('button', { name: 'Copy the example request body' }).click()
  await expect
    .poll(() => page.evaluate(async () => JSON.parse(await navigator.clipboard.readText()) as unknown))
    .toEqual({ orderId: 'ord_8f2k', total: 49, lines: [{ sku: 'LAMP-01' }] })

  await page.getByRole('button', { name: 'Edit the response body as JSON' }).click()
  await page.getByRole('textbox', { name: 'Response body as JSON' }).fill('{"rows": 1}')
  await page.getByRole('button', { name: 'Use this JSON' }).click()
  await expect(mark).toHaveText('{4} → {1}')

  await page.getByRole('button', { name: 'Flows' }).click()
  const write = logRow(page, 8)
  const answer = logRow(page, 10)
  await expect(write).toContainText('INSERT orders')
  await expect(write).toContainText('{"orderId":"ord_8f2k","total":49,"lines":[{"sku":"LAMP-01"}]}')
  await expect(answer).toContainText('{"rows":1}')

  await page.getByRole('button', { name: 'Flow settings' }).click()
  await page.getByRole('switch', { name: 'Show request and response bodies' }).click()
  await expect(write).not.toContainText('orderId')
  await expect(write).toContainText('INSERT orders')
})

test('shows the request and the response body in the presentation log line', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Present' }).click()
  await expect(page).toHaveURL(/#\/p\//)
  const caption = page.locator('.dg-caption')
  const body = page.locator('.dg-caption-body')
  await expect(caption).toContainText('Browser → API gateway', { timeout: 10_000 })
  await expect(body).toContainText('"sku":"LAMP-01"')
  await expect(caption).toContainText('Stripe → Orders', { timeout: 15_000 })
  await expect(body).toHaveText('{"id":"pi_3Nf","status":"succeeded"}')
})
