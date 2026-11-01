import { expect, test } from './fixtures'
import { copyTemplate } from './helpers'

test('inserts the product that the search names', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  const nodes = page.locator('[data-editor-canvas] .react-flow__node')
  const before = await nodes.count()
  await page.getByRole('button', { name: 'Insert' }).click()
  await page.keyboard.type('postgres')
  await expect(page.getByRole('option').first()).toContainText('PostgreSQL')
  await expect(page.getByRole('option', { name: /Service/ })).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(nodes).toHaveCount(before + 1)
  await expect(nodes.filter({ hasText: 'PostgreSQL' })).toHaveCount(1)
})

test('selects the best match again when the products arrive after the search', async ({ page }) => {
  let releaseLogos = () => {}
  const logosReleased = new Promise<void>((resolve) => {
    releaseLogos = resolve
  })
  const logoSet = (url: URL) => url.pathname.endsWith('/logos.json') && url.search === ''
  await page.route(logoSet, async (route) => {
    await logosReleased
    await route.continue()
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await expect(page.getByText('Start with a node')).toBeVisible()
  await page.keyboard.press('n')
  await page.keyboard.type('postgres')
  await expect(page.getByRole('option').first()).toHaveText('Database')
  releaseLogos()
  await expect(page.getByRole('option').first()).toContainText('PostgreSQL', { timeout: 10_000 })
  await page.keyboard.press('Enter')
  await expect(page.locator('.react-flow__node', { hasText: 'PostgreSQL' })).toHaveCount(1)
})
