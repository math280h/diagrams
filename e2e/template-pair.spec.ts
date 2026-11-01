import { expect, test } from './fixtures'
import { copyTemplate } from './helpers'

test('copies the containers diagram with the C4 context and opens it from the system card', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'C4 system context')
  await expect(page.getByLabel('Diagram name')).toHaveValue('Staybook: system context')
  await page.getByRole('button', { name: 'Open Staybook: containers' }).click()
  await expect(page.getByLabel('Diagram name')).toHaveValue('Staybook: containers')
  await expect(page.locator('[data-editor-canvas] .react-flow__node')).toHaveCount(16)
})
