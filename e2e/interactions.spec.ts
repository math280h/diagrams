import { expect, test, type Page } from '@playwright/test'
import { copyTemplate } from './helpers'

async function insertAt(page: Page, x: number, y: number, query: string) {
  await page.mouse.move(x, y)
  await page.keyboard.press('n')
  await page.getByPlaceholder('Insert a node').fill(query)
  await page.keyboard.press('Enter')
}

test('inserts nodes at the pointer and connects them', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await expect(page.getByText('Start with a node')).toBeVisible()

  await insertAt(page, 300, 300, 'browser')
  await insertAt(page, 800, 300, 'database')
  await expect(page.locator('.react-flow__node')).toHaveCount(2)

  const source = page.locator('.react-flow__node', { hasText: 'Browser' })
  const target = page.locator('.react-flow__node', { hasText: 'Database' })
  await source.hover()
  const handle = source.locator('.react-flow__handle-right')
  const from = await handle.boundingBox()
  const to = await target.locator('.react-flow__handle-left').boundingBox()
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2)
  await page.mouse.down()
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 12 })
  await page.mouse.up()

  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
})

test('records a flow path through the shortest chain of connections', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Flows' }).click()
  await page.getByRole('button', { name: /Place an order/ }).click()
  await page.getByRole('menuitem', { name: 'New flow' }).click()
  await expect(page.getByText('Press Esc to stop')).toBeVisible()

  await page.locator('.react-flow__node', { hasText: 'Browser' }).click()
  await page.locator('.react-flow__node', { hasText: 'Postgres' }).click()
  await page.keyboard.press('Escape')

  const steps = page.locator('[data-index]')
  await expect(steps).toHaveCount(5)
  await expect(steps.first()).toContainText('Browser')
  await expect(steps.last()).toContainText('Postgres')
})

test('adds a connected node when a connection ends on empty canvas', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await expect(page.getByText('Start with a node')).toBeVisible()
  await page.keyboard.press('n')
  await page.getByPlaceholder('Insert a node').fill('service')
  await page.keyboard.press('Enter')
  const source = page.locator('.react-flow__node').first()
  await source.hover()
  const from = await source.locator('.react-flow__handle-right').boundingBox()
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2)
  await page.mouse.down()
  await page.mouse.move(from!.x + 320, from!.y + 40, { steps: 12 })
  await page.mouse.up()

  await page.getByPlaceholder('Add a connected node').fill('redis')
  await page.keyboard.press('Enter')
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  await expect(page.locator('.react-flow__node', { hasText: 'Cache' })).toBeVisible()
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
})

test('pans with a drag, selects with a shift drag, and snaps dropped nodes to the grid', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  const viewport = page.locator('.react-flow__viewport')
  await expect(page.locator('.react-flow__node').first()).toBeVisible()

  const before = await viewport.getAttribute('style')
  await page.mouse.move(1200, 150)
  await page.mouse.down()
  await page.mouse.move(1100, 220, { steps: 8 })
  await page.mouse.up()
  expect(await viewport.getAttribute('style')).not.toBe(before)
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(0)

  await page.keyboard.down('Shift')
  await page.mouse.move(10, 60)
  await page.mouse.down()
  await page.mouse.move(1270, 700, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
  expect(await page.locator('.react-flow__node.selected').count()).toBeGreaterThan(3)

  await page.keyboard.press('Escape')
  const node = page.locator('.react-flow__node', { hasText: 'Auth' }).first()
  const box = await node.boundingBox()
  await page.mouse.move(box!.x + 40, box!.y + 20)
  await page.mouse.down()
  await page.mouse.move(box!.x + 93, box!.y + 51, { steps: 8 })
  await page.mouse.up()
  await expect(node).toHaveAttribute('style', /translate\((-?\d*[02468])px, (-?\d*[02468])px\)/)
  const transform = await node.evaluate((element) => element.style.transform)
  const [x = Number.NaN, y = Number.NaN] = [...transform.matchAll(/-?\d+(\.\d+)?/g)].map((match) => Number(match[0]))
  expect(x % 16).toBe(0)
  expect(y % 16).toBe(0)
})
