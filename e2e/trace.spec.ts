import { expect, test } from './fixtures'
import { copyTemplate } from './helpers'

test('plays a trace on the cards of a diagram', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  const nodes = page.locator('[data-editor-canvas] .react-flow__node')
  const nodeCount = await nodes.count()

  await page.getByRole('button', { name: 'Flows' }).click()
  await page.getByRole('button', { name: 'Place an order' }).click()
  await page.getByRole('menuitem', { name: 'Import a trace' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import a trace' })
  await dialog.getByRole('button', { name: 'Use a sample trace' }).click()
  await expect(dialog).toContainText(
    '9 spans reach 7 parts of the system. All of them have cards in this diagram. The import adds a flow with 14 steps.',
  )
  await dialog.getByRole('button', { name: 'Import trace' }).click()

  await expect(dialog).toBeHidden()
  await expect(nodes).toHaveCount(nodeCount)
  await expect(page.getByRole('button', { name: 'POST /orders', exact: true })).toBeVisible()
  const flow = page.getByRole('region', { name: 'Flow' })
  await expect(flow).toContainText('orders.v1.Orders/CreateOrder')
  await expect(flow).toContainText('429')
  await expect(flow).toContainText('384 ms')

  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.locator('.dg-token-dot')).toBeVisible()
})

test('makes a new diagram from a trace file', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import' }).click()
  await page.getByRole('tab', { name: 'Trace' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import a diagram' })
  const chooserOpens = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: 'Open a trace file' }).click()
  const chooser = await chooserOpens
  const trace = {
    data: [
      {
        traceID: 't1',
        spans: [
          {
            traceID: 't1',
            spanID: 'a',
            operationName: 'GET /cart',
            references: [],
            startTime: 1000,
            duration: 9000,
            tags: [{ key: 'span.kind', type: 'string', value: 'server' }],
            processID: 'p1',
          },
          {
            traceID: 't1',
            spanID: 'b',
            operationName: 'HGET cart',
            references: [{ refType: 'CHILD_OF', traceID: 't1', spanID: 'a' }],
            startTime: 2000,
            duration: 3000,
            tags: [
              { key: 'span.kind', type: 'string', value: 'client' },
              { key: 'db.system', type: 'string', value: 'redis' },
            ],
            processID: 'p1',
          },
        ],
        processes: { p1: { serviceName: 'cart-service', tags: [] } },
      },
    ],
  }
  await chooser.setFiles({
    name: 'trace.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(trace)),
  })
  await expect(dialog).toContainText('2 spans reach 2 parts of the system.')
  await dialog.getByRole('button', { name: 'Import trace' }).click()

  await expect(page).toHaveURL(/#\/d\//)
  await expect(page.getByLabel('Diagram name')).toHaveValue('GET /cart')
  await expect(page.locator('[data-editor-canvas] .react-flow__node')).toHaveCount(2)
  await expect(page.locator('[data-editor-canvas] .react-flow__node', { hasText: 'Cart service' })).toBeVisible()
  await expect(page.locator('[data-editor-canvas] .react-flow__node', { hasText: 'Redis' })).toBeVisible()
})

test('explains a file that is not a trace', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import' }).click()
  await page.getByRole('tab', { name: 'Trace' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import a diagram' })
  await dialog.getByLabel('Trace JSON').fill('{"nodes": []}')
  await expect(dialog).toContainText('The file holds no spans.')
  await expect(dialog.getByRole('button', { name: 'Import trace' })).toBeDisabled()
})
