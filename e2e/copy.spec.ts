import { expect, test } from '@playwright/test'
import { copyTemplate } from './helpers'

test('shows a page with a way home for an address that does not exist', async ({ page }) => {
  await page.goto('/#/no-such-page')
  await expect(page.getByText('This page does not exist')).toBeVisible()
  await page.getByRole('button', { name: 'Go to all diagrams' }).click()
  await expect(page).toHaveURL(/#\/$/)
})

test('points a blank diagram to flows and templates, and says that site data holds the diagrams', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await expect(page.getByText(/record a flow that plays a request/)).toBeVisible()
  await page.getByRole('link', { name: 'start from a template' }).click()
  await expect(page.getByRole('heading', { name: 'Start from a template that is already playing' })).toBeVisible()

  await copyTemplate(page, 'Order system')
  await page.getByRole('link', { name: 'All diagrams' }).click()
  await expect(page.getByText(/Clearing the site data of this browser deletes them/)).toBeVisible()
})

test('inserts a node from the canvas menu, and suggests a detail that fits the kind of node', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  const nodes = page.locator('[data-editor-canvas] .react-flow__node')
  const before = await nodes.count()
  await page.locator('.react-flow__pane').click({ button: 'right', position: { x: 60, y: 600 } })
  await page.getByRole('menuitem', { name: /Insert a node here/ }).click()
  await page.getByPlaceholder('Insert a node').fill('database')
  await page.keyboard.press('Enter')
  await expect(nodes).toHaveCount(before + 1)
  await expect(page.getByPlaceholder('Postgres 16, orders')).toBeVisible()
})
