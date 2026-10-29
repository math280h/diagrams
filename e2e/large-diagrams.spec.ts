import { expect, test } from '@playwright/test'
import { copyTemplate } from './helpers'

test('shows less detail and larger titles when zoomed out, and a minimap that hides', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Multi-cloud')
  const canvas = page.locator('[data-editor-canvas] .dg-canvas')
  await page.keyboard.press('Shift+Digit1')
  await expect(canvas).toHaveAttribute('data-lod', /far/)
  await expect(page.locator('.dg-card-lines').first()).toBeHidden()
  await page.getByRole('button', { name: 'Reset zoom to 100%' }).click()
  await expect(canvas).not.toHaveAttribute('data-lod', /.+/)
  await expect(page.locator('.dg-card-lines').first()).toBeVisible()

  await expect(page.locator('.react-flow__minimap')).toBeVisible()
  await page.getByRole('button', { name: 'Minimap' }).click()
  await expect(page.locator('.react-flow__minimap')).toHaveCount(0)
})

test('goes to a node from the command menu', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Multi-cloud')
  await page.keyboard.press('Control+k')
  await page.getByPlaceholder('Search for an action or a node…').fill('Fraud model')
  await page.getByRole('option', { name: 'Fraud model' }).click()
  const node = page.locator('.react-flow__node.selected', { hasText: 'Fraud model' })
  await expect(node).toHaveCount(1)
  await expect(node).toBeInViewport()
})

test('explores a node and its neighbours in Present', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Present' }).click()
  await page.getByRole('button', { name: 'Explore' }).click()
  const strip = page.getByRole('navigation', { name: 'Neighbours' })
  await expect(strip).toBeVisible()
  await expect(page.locator('.react-flow__node.dg-explore-focus')).toHaveCount(1)
  await strip.getByRole('button', { name: /Postgres/ }).click()
  await expect(page.locator('.react-flow__node.dg-explore-focus', { hasText: 'Postgres' })).toHaveCount(1)
  await expect(strip.getByText('Postgres', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(strip).toBeHidden()
  await expect(page).toHaveURL(/#\/p\//)
})
