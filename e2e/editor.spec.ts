import { expect, test, type Page } from '@playwright/test'
import { copyTemplate } from './helpers'

async function insert(page: Page, query: string) {
  await page.keyboard.press('n')
  const input = page.getByPlaceholder('Insert a node')
  await input.fill(query)
  await page.keyboard.press('Enter')
  await expect(input).toHaveCount(0)
}

async function openTemplate(page: Page, name: string) {
  await page.goto('/')
  await copyTemplate(page, name)
}

test('creates a diagram, adds nodes, undoes, and keeps the result after a reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await expect(page.getByLabel('Diagram name')).toHaveValue('Untitled diagram')

  await insert(page, 'database')
  await insert(page, 'load balancer')
  await expect(page.locator('.react-flow__node')).toHaveCount(2)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  await page.getByRole('button', { name: 'Redo' }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(2)

  await page.getByLabel('Diagram name').fill('Storage tier')
  await page.getByLabel('Diagram name').press('Enter')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('dg:index'))).toContain('Storage tier')
  await page.reload()
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  await expect(page.getByLabel('Diagram name')).toHaveValue('Storage tier')
})

test('deletes a new diagram that the user leaves empty, and keeps one with a name', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await expect(page.getByLabel('Diagram name')).toHaveValue('Untitled diagram')
  await page.goBack()
  await expect(page.getByRole('heading', { name: /Draw how your system works/ })).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('dg:index'))).toBe('[]')

  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await page.getByLabel('Diagram name').fill('Kept for later')
  await page.getByLabel('Diagram name').press('Enter')
  await page.getByRole('link', { name: 'All diagrams' }).click()
  await expect(page.getByRole('link', { name: 'Kept for later' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Untitled diagram' })).toHaveCount(0)
})

test('edits a node in the properties panel', async ({ page }) => {
  await openTemplate(page, 'Order system')
  await expect(page.getByRole('complementary', { name: 'Properties' })).toHaveCount(0)
  await page.locator('.react-flow__node', { hasText: 'API gateway' }).click()
  const name = page.getByRole('group', { name: 'Name' }).getByRole('textbox')
  await name.fill('Edge proxy')
  await expect(page.locator('.react-flow__node', { hasText: 'Edge proxy' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Kind' }).click()
  await page.getByRole('option', { name: 'Data store' }).click()
  await expect(page.locator('.react-flow__node', { hasText: 'Edge proxy' }).locator('.dg-card')).toHaveAttribute(
    'data-form',
    'datastore',
  )
})

test('inserts a cloud service with its official icon from the insert menu', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await expect(page.getByLabel('Diagram name')).toHaveValue('Untitled diagram')
  await page.keyboard.press('n')
  await page.getByPlaceholder('Insert a node').fill('lambda')
  await page.getByRole('option', { name: /AWS Lambda/ }).click()
  const card = page.locator('.react-flow__node', { hasText: 'AWS Lambda' })
  await expect(card.locator('.dg-card')).toHaveAttribute('data-form', 'function')
  await expect(card.locator('img.dg-art')).toBeVisible()
})

test('picks a logo in the icon picker', async ({ page }) => {
  await openTemplate(page, 'Order system')
  await page.locator('.react-flow__node', { hasText: 'Auth' }).click()
  await page.getByRole('group', { name: 'Icon' }).getByRole('button').click()
  await page.getByLabel('Search icons').fill('keycloak')
  await page.getByRole('button', { name: 'Keycloak' }).click()
  await expect(page.getByRole('group', { name: 'Icon' })).toContainText('Keycloak')
  await expect(page.locator('.react-flow__node', { hasText: 'Auth' }).locator('svg.dg-logo')).toBeVisible()
})

test('opens the insert menu with a double-click on the canvas', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await expect(page.getByText('Start with a node')).toBeVisible()
  await page.locator('.react-flow__pane').dblclick({ position: { x: 400, y: 300 } })
  await page.getByPlaceholder('Insert a node').fill('queue')
  await page.keyboard.press('Enter')
  await expect(page.locator('.react-flow__node .dg-card[data-form="queue"]')).toHaveCount(1)
})

test('animates traffic particles on edges', async ({ page }) => {
  await openTemplate(page, 'Event pipeline')
  const particle = page.locator('.dg-particle').first()
  const before = await particle.getAttribute('cx')
  await expect.poll(() => particle.getAttribute('cx')).not.toBe(before)
})

test('opens the command menu and runs an action from it', async ({ page }) => {
  await openTemplate(page, 'Order system')
  await page.keyboard.press('Control+k')
  const input = page.getByPlaceholder('Search for an action')
  await expect(input).toBeVisible()
  await input.fill('add database')
  await page.keyboard.press('Enter')
  await expect(page.locator('.react-flow__node', { hasText: 'Database' }).first()).toBeAttached()
  await expect(page.getByText('This page hit an error')).toHaveCount(0)
})

test('wraps the selected nodes in a cloud boundary from the insert menu', async ({ page }) => {
  await openTemplate(page, 'Order system')
  await page.locator('.react-flow__node', { hasText: 'Auth' }).first().click()
  await page
    .locator('.react-flow__node', { hasText: 'Email worker' })
    .first()
    .click({ modifiers: ['Shift'] })
  await page.mouse.move(700, 120)
  await page.keyboard.press('n')
  await page.getByPlaceholder('Insert a node').fill('aws account')
  await expect(page.getByText('AWS, wraps the selection')).toBeVisible()
  await page.keyboard.press('Enter')

  const account = page.locator('.react-flow__node-group', {
    has: page.locator('.dg-group-kind', { hasText: 'AWS account' }),
  })
  await expect(account).toHaveCount(1)
  const accountId = await account.getAttribute('data-id')
  const boundary = page.locator(`.react-flow__node[data-id="${accountId}"]`)

  await boundary.locator('.dg-group-kind').click()
  await page.getByRole('combobox', { name: 'Kind' }).click()
  await page.getByRole('option', { name: 'Azure subscription' }).click()
  await expect(boundary.locator('.dg-group-kind')).toHaveText('Azure subscription')
})
