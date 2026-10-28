import { readFile } from 'node:fs/promises'
import { expect, test, type Download } from '@playwright/test'
import { copyTemplate } from './helpers'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

test('exports a dark and a light image with a snippet for a README', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: /README images/ }).click()

  await page.getByRole('textbox', { name: 'Image path' }).fill('docs/orders')
  const snippet = page.getByRole('textbox', { name: 'README snippet' })
  await expect(snippet).toHaveValue(
    /^<picture>\n {2}<source media="\(prefers-color-scheme: dark\)" srcset="docs\/orders-dark\.png">\n {2}<img src="docs\/orders-light\.png" alt="Order system\. The diagram has 9 parts/,
  )
  await expect(snippet).toHaveValue(
    /13\. Email worker: send confirmation \(120 ms\) — The email worker sends the confirmation\.">\n<\/picture>\n$/,
  )
  const text = await snippet.inputValue()
  await page.getByRole('button', { name: 'Copy snippet' }).click()
  // The Windows clipboard gives the line ends as CRLF.
  await expect
    .poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).replaceAll('\r\n', '\n')))
    .toBe(text)

  const downloads: Download[] = []
  page.on('download', (download) => downloads.push(download))
  await page.getByRole('button', { name: 'Download images' }).click()
  await expect.poll(() => downloads.length, { timeout: 30_000 }).toBe(2)
  expect(downloads.map((download) => download.suggestedFilename())).toEqual(['orders-dark.png', 'orders-light.png'])
  const [dark, light] = await Promise.all(downloads.map(async (download) => readFile(await download.path())))
  expect(dark!.subarray(0, 8)).toEqual(PNG_SIGNATURE)
  expect(light!.subarray(0, 8)).toEqual(PNG_SIGNATURE)
  expect(dark!.equals(light!)).toBe(false)

  await page.getByRole('button', { name: 'GIF', exact: true }).click()
  await expect(snippet).toHaveValue(/srcset="docs\/orders-dark\.gif"/)
  await expect(page.getByRole('combobox', { name: 'Animation' })).toContainText('Flow “Place an order”')
})
