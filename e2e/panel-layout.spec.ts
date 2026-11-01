import { expect, test } from './fixtures'
import { copyTemplate } from './helpers'

test('resizes the properties and the flow panel, and keeps the sizes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.locator('.react-flow__node', { hasText: 'Orders' }).first().click()
  await page.getByRole('button', { name: 'Flows' }).click()

  const properties = page.getByRole('complementary', { name: 'Properties' })
  const before = (await properties.boundingBox())!.width
  const handle = page.getByRole('separator', { name: 'Resize properties' })
  await handle.focus()
  await handle.press('Shift+ArrowLeft')
  await expect.poll(async () => (await properties.boundingBox())!.width).toBe(before + 64)

  const flowPanel = page.getByRole('region', { name: 'Flow' })
  const flowBefore = (await flowPanel.boundingBox())!.height
  const flowHandle = page.getByRole('separator', { name: 'Resize the flow panel' })
  const box = (await flowHandle.boundingBox())!
  await page.mouse.move(box.x + 300, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 300, box.y + box.height / 2 - 60, { steps: 4 })
  await page.mouse.up()
  await expect.poll(async () => (await flowPanel.boundingBox())!.height).toBe(flowBefore + 60)

  await page.reload()
  await page.locator('.react-flow__node', { hasText: 'Orders' }).first().click()
  await expect.poll(async () => (await properties.boundingBox())?.width).toBe(before + 64)
  await handle.dblclick()
  await expect.poll(async () => (await properties.boundingBox())!.width).toBe(288)
})

test('moves the view switch and recording into a menu when the flow toolbar is narrow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.locator('.react-flow__node', { hasText: 'Orders' }).first().click()
  await page.getByRole('button', { name: 'Flows' }).click()
  await expect(page.getByRole('button', { name: 'Sequence', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'More flow controls' }).click()
  await page.getByRole('menuitemradio', { name: 'Sequence' }).click()
  await expect(page.getByRole('region', { name: 'Flow' }).locator('svg').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toBeHidden()
  await page.getByRole('button', { name: 'More flow controls' }).click()
  await page.getByRole('menuitem', { name: 'Record steps' }).click()
  await expect(page.getByText('Click the nodes in the order the flow reaches them', { exact: false })).toBeVisible()
})

test('keeps the name, Present and Export in the top bar on a phone, with the rest in a menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  const name = page.getByLabel('Diagram name')
  await expect.poll(async () => (await name.boundingBox())!.width).toBeGreaterThan(150)
  await expect(page.getByRole('button', { name: 'Present' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo' })).toBeHidden()
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Flows' }).click()
  await expect(page.getByRole('region', { name: 'Flow' })).toBeVisible()
})
