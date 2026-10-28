import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { decode } from 'modern-gif'
import { DIAGRAM_VERSION } from '@/model/schema'
import { copyTemplate } from './helpers'

test('exports a PNG image and a diagram file', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')

  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: /Image/ }).click()
  await expect(page.getByAltText('Export preview')).toBeVisible({ timeout: 20_000 })
  const imageDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export PNG' }).click()
  const image = await imageDownload
  const bytes = await readFile(await image.path())
  expect(bytes.subarray(1, 4).toString()).toBe('PNG')

  await page.getByRole('button', { name: 'Export' }).click()
  const jsonDownload = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: /Diagram file/ }).click()
  const json = JSON.parse(await readFile(await (await jsonDownload).path(), 'utf8'))
  expect(json.version).toBe(DIAGRAM_VERSION)
  expect(json.nodes.length).toBeGreaterThan(5)
})

test('exports a Mermaid flowchart to copy or download', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: /Mermaid/ }).click()

  const text = page.getByRole('textbox', { name: 'Mermaid flowchart' })
  await expect(text).toHaveValue(/^flowchart LR\n/)
  await expect(text).toHaveValue(/api_gateway\["API gateway<br\/>Envoy"\]/)
  const mermaid = await text.inputValue()

  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  // The Windows clipboard gives the line ends as CRLF.
  await expect
    .poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).replaceAll('\r\n', '\n')))
    .toBe(mermaid)

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download .mmd' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/\.mmd$/)
  expect(await readFile(await file.path(), 'utf8')).toBe(mermaid)
})

test('exports a flow as a WebM video', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Checkout flow')
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: /Animation/ }).click()
  await page.getByRole('button', { name: 'WebM', exact: true }).click()
  await page.getByRole('button', { name: '720p' }).click()
  const download = page.waitForEvent('download', { timeout: 85_000 })
  await page.getByRole('button', { name: 'Export WebM' }).click()
  const video = await download
  const bytes = await readFile(await video.path())
  expect(bytes.subarray(0, 4).toString('hex')).toBe('1a45dfa3')
})

test('exports the traffic animation as a GIF', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Event pipeline')
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: /Animation/ }).click()
  await page.getByRole('combobox', { name: 'Content' }).click()
  await page.getByRole('option', { name: 'Traffic only, no flow' }).click()
  await page.getByRole('button', { name: 'GIF', exact: true }).click()
  const frameRate = page.getByRole('group', { name: 'Frame rate' })
  await expect(frameRate.getByRole('button', { name: '20 fps' })).toHaveAttribute('aria-pressed', 'true')
  await expect(frameRate.getByRole('button', { name: '15 fps' })).toHaveCount(0)
  await frameRate.getByRole('button', { name: '10 fps' }).click()
  await page.getByRole('slider').fill('2')
  const download = page.waitForEvent('download', { timeout: 85_000 })
  await page.getByRole('button', { name: 'Export GIF' }).click()
  const bytes = await readFile(await (await download).path())
  expect(bytes.subarray(0, 6).toString()).toBe('GIF89a')
  const frames = decode(bytes).frames
  expect(frames.length).toBeGreaterThan(5)
  expect(new Set(frames.map((frame) => frame.delay))).toEqual(new Set([100]))
})
