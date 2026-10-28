import { expect, test } from '@playwright/test'
import { copyTemplate } from './helpers'

test('shows the pointer cursor on buttons that work, and not on disabled ones', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Style and theme' }).click()
  const canvasTheme = page.getByRole('group', { name: 'Canvas theme' })
  await expect(canvasTheme.getByRole('button', { name: 'Dark' })).toHaveCSS('cursor', 'pointer')
  await expect(page.getByRole('group', { name: 'App theme' }).getByRole('button', { name: 'Light' })).toHaveCSS(
    'cursor',
    'pointer',
  )
  await expect(page.getByRole('button', { name: 'Present' })).toHaveCSS('cursor', 'pointer')
  await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Redo' })).not.toHaveCSS('cursor', 'pointer')
})
