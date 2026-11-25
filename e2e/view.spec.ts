import { readFileSync } from 'node:fs'
import { expect, test, type Page } from './fixtures'
import { copyTemplate } from './helpers'

const SAVE_WAIT_MS = 1000

const storedDiagram = (page: Page, id: string) => page.evaluate((key) => localStorage.getItem(key), `dg:diagram:${id}`)

const deviceViews = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('dg:views') ?? '[]') as { id: string }[])

test('keeps the view of a diagram in the browser after a reload, and the diagram does not change', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  const id = new URL(page.url()).hash.split('/').at(-1)!
  const viewport = page.locator('[data-editor-canvas] .react-flow__viewport')
  await page.waitForTimeout(SAVE_WAIT_MS)
  const before = await storedDiagram(page, id)
  const fitted = await viewport.getAttribute('style')
  expect(await deviceViews(page)).toEqual([])

  await page.mouse.move(1200, 150)
  await page.mouse.down()
  await page.mouse.move(1000, 300, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -200)
  await page.keyboard.up('Control')
  await page.waitForTimeout(SAVE_WAIT_MS)
  const moved = await viewport.getAttribute('style')
  expect(moved).not.toBe(fitted)
  expect(await deviceViews(page)).toEqual([expect.objectContaining({ id })])
  expect(await storedDiagram(page, id)).toBe(before)

  await page.reload()
  await expect(page.locator('[data-editor-canvas] .react-flow__node').first()).toBeVisible()
  await expect(viewport).toHaveAttribute('style', moved!)
  await page.waitForTimeout(SAVE_WAIT_MS)
  expect(await storedDiagram(page, id)).toBe(before)
})

test('opens a diagram of format 21 at the view in its data the first time', async ({ page }) => {
  const sample = JSON.parse(readFileSync('src/persistence/formats/v21.json', 'utf8')) as {
    diagrams: { id: string; name: string; version: number }[]
  }
  const diagram = sample.diagrams.find((candidate) => candidate.name === 'Order system')!
  expect(diagram.version).toBe(21)
  const stored = { ...diagram, viewport: { x: -320.5, y: 48, zoom: 0.75 } }
  await page.goto('/')
  await page.evaluate((value) => {
    localStorage.setItem(`dg:diagram:${value.id}`, JSON.stringify(value))
  }, stored)

  await page.goto(`/#/d/${diagram.id}`)
  await expect(page.getByLabel('Diagram name')).toHaveValue('Order system')
  const viewport = page.locator('[data-editor-canvas] .react-flow__viewport')
  await expect(viewport).toHaveAttribute('style', /translate\(-320\.5px, 48px\) scale\(0\.75\)/)
  expect(await deviceViews(page)).toEqual([{ id: diagram.id, x: -320.5, y: 48, zoom: 0.75 }])
})
