import { expect, test } from './fixtures'
import { copyTemplate } from './helpers'

test('keeps the settings of the diagram and of the app on separate tabs', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Settings' }).click()

  const diagram = page.getByRole('tab', { name: 'This diagram' })
  await expect(diagram).toHaveAttribute('aria-selected', 'true')
  const panel = page.getByRole('tabpanel')
  await expect(panel).toContainText('Saved in the diagram.')
  await expect(panel.getByRole('group', { name: 'Traffic style for all connections' })).toBeVisible()
  for (const name of ['Route connections around nodes', 'Snap to grid'])
    await expect(panel.getByRole('switch', { name })).toBeVisible()
  await expect(panel.getByRole('group', { name: 'Theme mode' })).toHaveCount(0)
  await expect(panel.getByRole('switch', { name: 'Animate traffic while editing' })).toHaveCount(0)

  await page.getByRole('tab', { name: 'App' }).click()
  await expect(panel).toContainText('Only for you, on this device.')
  for (const name of ['Theme mode', 'When the system asks for more contrast', 'Your themes'])
    await expect(panel.getByRole('group', { name })).toBeVisible()
  for (const name of ['Light theme', 'Dark theme'])
    await expect(panel.getByRole('combobox', { name, exact: true })).toBeVisible()
  await expect(panel.getByRole('switch', { name: 'Animate traffic while editing' })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Keyboard shortcuts' })).toBeVisible()
  await expect(panel.getByRole('group', { name: 'Traffic style for all connections' })).toHaveCount(0)
})
