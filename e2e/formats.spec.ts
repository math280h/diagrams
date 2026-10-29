import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

function card(page: Page, title: string) {
  return page.locator('[data-editor-canvas] .react-flow__node', { hasText: title }).first().locator('.dg-card')
}

async function pasteText(page: Page, text: string) {
  await page.evaluate((value) => {
    const data = new DataTransfer()
    data.setData('text/plain', value)
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  }, text)
}

test('opens a diagram file that version 0.1.2 exported', async ({ page }) => {
  const sample = JSON.parse(readFileSync('src/persistence/formats/v6.json', 'utf8')) as {
    diagrams: { name: string; version: number; nodes: unknown[] }[]
  }
  const diagram = sample.diagrams.find((candidate) => candidate.name === 'Order system')!
  expect(diagram.version).toBe(6)

  await page.goto('/')
  await page.getByRole('button', { name: 'Import' }).click()
  await page.getByRole('tab', { name: 'Diagram file' }).click()
  const chooserOpens = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Choose a .diagram.json file/ }).click()
  const chooser = await chooserOpens
  await chooser.setFiles({
    name: 'order-system.diagram.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(diagram)),
  })

  await expect(page).toHaveURL(/#\/d\//)
  await expect(page.getByLabel('Diagram name')).toHaveValue('Order system')
  await expect(page.locator('[data-editor-canvas] .react-flow__node')).toHaveCount(diagram.nodes.length)
  await card(page, 'Postgres').click()
  await expect(
    page.getByRole('complementary', { name: 'Properties' }).getByRole('button', { name: 'Neutral' }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('pastes nodes that an older version copied, and explains nodes from a newer version', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await expect(page.getByLabel('Diagram name')).toHaveValue('Untitled diagram')
  const legacy = {
    id: 'n_legacy',
    type: 'card',
    position: { x: 0, y: 0 },
    width: 216,
    data: {
      form: 'service',
      title: 'Legacy API',
      icon: '',
      accent: 'violet',
      lines: [],
      meter: null,
      meterText: '',
      status: 'none',
      badge: '',
    },
  }

  await pasteText(page, JSON.stringify({ marker: 'diagrams/clipboard@1', nodes: [legacy], edges: [] }))
  await expect(card(page, 'Legacy API')).toBeVisible()
  await expect(card(page, 'Legacy API')).not.toHaveAttribute('data-color')
  await expect(
    page.getByRole('complementary', { name: 'Properties' }).getByRole('button', { name: 'Neutral' }),
  ).toHaveAttribute('aria-pressed', 'true')

  await pasteText(page, JSON.stringify({ marker: 'diagrams/clipboard@1', version: 99, nodes: [], edges: [] }))
  await expect(page.getByText('The copied nodes use format 99 from a newer version of Diagrams.')).toBeVisible()
  await expect(page.locator('[data-editor-canvas] .react-flow__node')).toHaveCount(1)
})
