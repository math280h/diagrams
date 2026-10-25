import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
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
  await page.getByRole('slider').fill('2')
  const download = page.waitForEvent('download', { timeout: 85_000 })
  await page.getByRole('button', { name: 'Export GIF' }).click()
  const bytes = await readFile(await (await download).path())
  expect(bytes.subarray(0, 6).toString()).toBe('GIF89a')
})
