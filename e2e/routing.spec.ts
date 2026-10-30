import { expect, test, type Locator, type Page } from '@playwright/test'

async function insertAt(page: Page, x: number, y: number, query: string) {
  await page.mouse.click(x, y)
  await page.keyboard.press('n')
  await page.getByPlaceholder('Insert a node').fill(query)
  await page.keyboard.press('Enter')
}

test.use({ viewport: { width: 1600, height: 900 } })

function onBorder(point: { x: number; y: number }, box: { x: number; y: number; width: number; height: number }) {
  const near = (a: number, b: number) => Math.abs(a - b) < 4
  const withinX = point.x > box.x - 4 && point.x < box.x + box.width + 4
  const withinY = point.y > box.y - 4 && point.y < box.y + box.height + 4
  return (
    ((near(point.x, box.x) || near(point.x, box.x + box.width)) && withinY) ||
    ((near(point.y, box.y) || near(point.y, box.y + box.height)) && withinX)
  )
}

/** Inserts three cards in a row and connects the first to the last, past the middle one. */
async function rowWithLongEdge(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await expect(page.getByText('Start with a node')).toBeVisible()
  await insertAt(page, 500, 420, 'cache')
  const first = page.locator('.react-flow__node', { hasText: 'Cache' })
  let box = (await first.boundingBox())!
  await expect
    .poll(async () => {
      const now = (await first.boundingBox())!
      const settled = now.x === box.x && now.y === box.y
      box = now
      return settled
    })
    .toBe(true)
  const y = box.y + box.height / 2
  await insertAt(page, box.x - 220, y, 'browser')
  await insertAt(page, box.x + box.width + 220, y, 'database')
  await expect(page.locator('.react-flow__node')).toHaveCount(3)
  const source = page.locator('.react-flow__node', { hasText: 'Browser' })
  const middle = page.locator('.react-flow__node', { hasText: 'Cache' })
  const target = page.locator('.react-flow__node', { hasText: 'Database' })
  const [a, b, c] = await Promise.all([source.boundingBox(), middle.boundingBox(), target.boundingBox()])
  expect(a!.x + a!.width).toBeLessThan(b!.x)
  expect(b!.x + b!.width).toBeLessThan(c!.x)
  await source.hover()
  const from = (await source.locator('.react-flow__handle-right').boundingBox())!
  const to = (await target.locator('.react-flow__handle-left').boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 })
  await page.mouse.up()
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  const ends = await page.locator('.dg-edge-path').evaluate((path: SVGPathElement) => {
    const matrix = path.getScreenCTM()!
    const screen = (at: number) => {
      const point = path.getPointAtLength(at)
      return {
        x: matrix.a * point.x + matrix.c * point.y + matrix.e,
        y: matrix.b * point.x + matrix.d * point.y + matrix.f,
      }
    }
    return [screen(0), screen(path.getTotalLength())]
  })
  const [start, end] = await Promise.all([source.boundingBox(), target.boundingBox()])
  expect(onBorder(ends[0]!, start!)).toBe(true)
  expect(onBorder(ends[1]!, end!)).toBe(true)
  return middle
}

/** Returns true if the edge path passes inside the box of a node. */
async function crosses(page: Page, node: Locator) {
  const box = (await node.boundingBox())!
  return page.locator('.dg-edge-path').evaluate((path: SVGPathElement, rect) => {
    const matrix = path.getScreenCTM()!
    const length = path.getTotalLength()
    for (let at = 0; at <= length; at += 2) {
      const point = path.getPointAtLength(at)
      const x = matrix.a * point.x + matrix.c * point.y + matrix.e
      const y = matrix.b * point.x + matrix.d * point.y + matrix.f
      if (x > rect.x + 2 && x < rect.x + rect.width - 2 && y > rect.y + 2 && y < rect.y + rect.height - 2) return true
    }
    return false
  }, box)
}

test('routes a connection around a card between its ends, also after the card moves', async ({ page }) => {
  const middle = await rowWithLongEdge(page)
  await expect.poll(() => crosses(page, middle)).toBe(false)

  const box = (await middle.boundingBox())!
  await page.mouse.move(box.x + 30, box.y + 12)
  await page.mouse.down()
  await page.mouse.move(box.x + 30, box.y + 92, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => crosses(page, middle)).toBe(false)
})

test('sets a route by hand with a segment handle, and resets it', async ({ page }) => {
  await rowWithLongEdge(page)
  const path = page.locator('.dg-edge-path')
  const point = await path.evaluate((element: SVGPathElement) => {
    const matrix = element.getScreenCTM()!
    const middle = element.getPointAtLength(element.getTotalLength() / 2)
    return {
      x: matrix.a * middle.x + matrix.c * middle.y + matrix.e,
      y: matrix.b * middle.x + matrix.d * middle.y + matrix.f,
    }
  })
  await page.mouse.click(point.x, point.y)
  const properties = page.getByRole('complementary', { name: 'Properties' })
  await expect(properties.getByText('Goes around other nodes.', { exact: false })).toBeVisible()

  const handle = page.locator('.dg-route-handle').first()
  await expect(handle).toBeVisible()
  const before = await path.getAttribute('d')
  const axis = await handle.getAttribute('data-axis')
  const box = (await handle.boundingBox())!
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + (axis === 'x' ? 64 : 0), start.y + (axis === 'y' ? -64 : 0), { steps: 6 })
  await page.mouse.up()

  await expect(properties.getByText('Route set by hand.')).toBeVisible()
  await expect(path).not.toHaveAttribute('d', before!)
  await properties.getByRole('button', { name: 'Reset route' }).click()
  await expect(properties.getByText('Goes around other nodes.', { exact: false })).toBeVisible()
  await expect(path).toHaveAttribute('d', before!)
})
