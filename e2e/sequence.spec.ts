import { expect, test } from '@playwright/test'
import { copyTemplate } from './helpers'

test('shows a flow as a sequence diagram that follows the playback', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Flows' }).click()
  await page.getByRole('button', { name: 'Sequence', exact: true }).click()

  const sequence = page.getByRole('region', { name: 'Sequence' })
  await expect(sequence.getByRole('button', { name: 'Browser', exact: true })).toBeVisible()
  await expect(sequence.getByRole('button', { name: 'Stripe', exact: true })).toBeVisible()
  await expect(sequence.getByRole('button', { name: /^Step 2: Browser to API gateway, TLS 1.3/ })).toBeVisible()

  await sequence.getByRole('button', { name: /^Step 6: Orders to Stripe/ }).click()
  await expect(sequence.locator('[aria-current="step"]')).toHaveAccessibleName(/^Step 6: Orders to Stripe.*active$/)
  await expect(page.locator('[data-editor-canvas] .react-flow__edge[data-flow="active"]')).toHaveCount(1)
})

test('copies a flow as a Mermaid sequence diagram', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: /Mermaid/ }).click()
  await page.getByRole('combobox', { name: 'Mermaid diagram' }).click()
  await page.getByRole('option', { name: 'Sequence of “Place an order”' }).click()

  const text = page.getByRole('textbox', { name: 'Mermaid sequence diagram' })
  await expect(text).toHaveValue(/^sequenceDiagram\n {4}title Place an order\n/)
  await expect(text).toHaveValue(/orders->>stripe: POST \/v1\/payment_intents 429 \(120 ms\)/)
  const mermaid = await text.inputValue()

  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Flows' }).click()
  await page.getByRole('button', { name: 'Place an order' }).click()
  await page.getByRole('menuitem', { name: 'Copy as Mermaid sequence' }).click()
  // The Windows clipboard gives the line ends as CRLF.
  await expect
    .poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).replaceAll('\r\n', '\n')))
    .toBe(mermaid)
})
