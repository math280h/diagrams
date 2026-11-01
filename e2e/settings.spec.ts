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
  for (const name of ['Canvas theme', 'Traffic style for all connections'])
    await expect(panel.getByRole('group', { name })).toBeVisible()
  for (const name of ['Route connections around nodes', 'Snap to grid'])
    await expect(panel.getByRole('switch', { name })).toBeVisible()
  await expect(panel.getByRole('group', { name: 'App theme' })).toHaveCount(0)
  await expect(panel.getByRole('switch', { name: 'Animate traffic while editing' })).toHaveCount(0)

  await page.getByRole('tab', { name: 'App' }).click()
  await expect(panel).toContainText('Only for you, on this device.')
  for (const name of ['App theme', 'Canvas contrast']) await expect(panel.getByRole('group', { name })).toBeVisible()
  await expect(panel.getByRole('switch', { name: 'Animate traffic while editing' })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Keyboard shortcuts' })).toBeVisible()
  await expect(panel.getByRole('group', { name: 'Canvas theme' })).toHaveCount(0)
})
