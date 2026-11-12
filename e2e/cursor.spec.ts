import { expect, test } from './fixtures'
import { copyTemplate } from './helpers'

test('shows the pointer cursor on buttons that work, and not on disabled ones', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Settings' }).click()
  const traffic = page.getByRole('group', { name: 'Traffic style for all connections' })
  await expect(traffic.getByRole('button', { name: 'Comets' })).toHaveCSS('cursor', 'pointer')
  await page.getByRole('tab', { name: 'App' }).click()
  await expect(page.getByRole('group', { name: 'Theme mode' }).getByRole('button', { name: 'Light' })).toHaveCSS(
    'cursor',
    'pointer',
  )
  await expect(page.getByRole('button', { name: 'Present' })).toHaveCSS('cursor', 'pointer')
  await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Redo' })).not.toHaveCSS('cursor', 'pointer')
})
