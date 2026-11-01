import { expect, test } from './fixtures'

test('shows an older version on the canvas and restores it as one undo step', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await expect(page.getByLabel('Diagram name')).toHaveValue('Untitled diagram')

  await page.keyboard.press('n')
  await page.getByPlaceholder('Insert a node').fill('database')
  await page.keyboard.press('Enter')
  await expect(page.locator('.react-flow__node')).toHaveCount(1)

  await page.getByRole('button', { name: 'Version history' }).click()
  const versions = page.getByRole('listbox', { name: 'Versions' })
  await expect(versions.getByRole('option')).toHaveCount(3)
  await expect(versions.getByRole('option').nth(1)).toContainText('You')
  await expect(versions.getByRole('option').nth(1)).toContainText('Added')

  await versions.getByRole('option', { name: /First opened/ }).click()
  const preview = page.locator('[data-history-preview]')
  await expect(preview.getByRole('status')).toContainText('First opened')
  await expect(preview.locator('.react-flow__node')).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(preview).toHaveCount(0)

  await versions.getByRole('option', { name: /First opened/ }).click()
  await preview.getByRole('button', { name: 'Restore this version' }).click()
  await expect(preview).toHaveCount(0)
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  await expect(versions.getByRole('option').nth(1)).toContainText('Restored a version')

  await page.locator('[data-sonner-toast]').getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
})

test('leaves the current diagram alone while an older version shows', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await expect(page.getByLabel('Diagram name')).toHaveValue('Untitled diagram')
  await page.keyboard.press('n')
  await page.getByPlaceholder('Insert a node').fill('database')
  await page.keyboard.press('Enter')
  const editorNodes = page.locator('[data-editor-canvas] .react-flow__node')
  await expect(editorNodes).toHaveCount(1)
  await editorNodes.first().click()

  await page.getByRole('button', { name: 'Version history' }).click()
  const versions = page.getByRole('listbox', { name: 'Versions' })
  await expect(versions.getByRole('option', { name: /Added Database/ })).toBeVisible()
  await versions.getByRole('option', { name: /First opened/ }).click()
  await expect(page.locator('[data-history-preview]')).toBeVisible()
  await expect(page.locator('[inert]').getByRole('button', { name: 'Undo' })).toHaveCount(1)
  await expect(page.locator('[inert]').getByRole('button', { name: 'Insert' })).toHaveCount(1)

  await versions.focus()
  await page.keyboard.press('Delete')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Control+a')
  await page.keyboard.press('n')

  await page.getByRole('button', { name: 'Back to current' }).click()
  await expect(editorNodes).toHaveCount(1)
  await expect(page.getByPlaceholder('Insert a node')).toHaveCount(0)
})

test('keeps an older version on the canvas when an edit from just before saves', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await expect(page.getByLabel('Diagram name')).toHaveValue('Untitled diagram')
  await page.getByRole('button', { name: 'Version history' }).click()
  const versions = page.getByRole('listbox', { name: 'Versions' })
  await expect(versions.getByRole('option', { name: /First opened/ })).toBeVisible()

  await page.getByLabel('Diagram name').fill('Renamed diagram')
  await page.getByLabel('Diagram name').press('Enter')
  await versions.getByRole('option', { name: /First opened/ }).click()
  const status = page.locator('[data-history-preview]').getByRole('status')
  await expect(status).toContainText('First opened')
  await expect(versions.getByRole('option', { name: /Renamed the diagram/ })).toBeVisible()
  await page.waitForTimeout(1000)
  await expect(status).toContainText('First opened')
})
