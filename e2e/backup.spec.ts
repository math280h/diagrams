import { readFileSync } from 'node:fs'
import { expect, test, type Page } from './fixtures'
import { copyTemplate } from './helpers'

declare global {
  interface Window {
    persistRequests: number
  }
}

function stubStorageManager(page: Page, persisted: boolean) {
  return page.addInitScript((value) => {
    window.persistRequests = 0
    Object.defineProperty(navigator.storage, 'persisted', { value: async () => value })
    Object.defineProperty(navigator.storage, 'persist', {
      value: async () => {
        window.persistRequests++
        return value
      },
    })
  }, persisted)
}

const persistRequests = (page: Page) => page.evaluate(() => window.persistRequests)

function diagramCard(page: Page, name: string) {
  return page
    .locator('main div.group')
    .filter({ has: page.getByRole('link', { name, exact: true }) })
    .first()
}

async function importFile(page: Page, file: string) {
  await page.getByRole('button', { name: 'Import' }).click()
  await page.getByRole('tab', { name: 'Diagram file' }).click()
  const chooserOpens = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Choose \.diagram\.json files/ }).click()
  await (await chooserOpens).setFiles(file)
}

test('asks for persistent storage at the first save, and says that the browser can delete the diagrams', async ({
  page,
}) => {
  await stubStorageManager(page, false)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Start from a template that is already playing' })).toBeVisible()
  expect(await persistRequests(page)).toBe(0)

  await copyTemplate(page, 'Order system')
  await expect.poll(() => persistRequests(page)).toBe(1)
  await page.getByRole('link', { name: 'All diagrams' }).click()
  await expect(page.getByText(/This browser can delete your diagrams when the disk is almost full\./)).toBeVisible()
  await expect(page.getByText(/Safari deletes them after 7 days without a visit\./)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back up all diagrams' })).toBeVisible()
  expect(await persistRequests(page)).toBe(1)
})

test('does not ask again when the storage is persistent, and names the site data', async ({ page }) => {
  await stubStorageManager(page, true)
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('link', { name: 'All diagrams' }).click()
  await expect(page.getByText(/Clearing the site data of this browser deletes your diagrams\./)).toBeVisible()
  await expect(page.getByText(/This browser can delete your diagrams/)).toHaveCount(0)
  expect(await persistRequests(page)).toBe(0)
})

test('exports the stored text of a diagram that the app cannot read, and explains a failed duplicate', async ({
  page,
}) => {
  const text = JSON.stringify({ id: 'd_newer', name: 'From a newer app', version: 999, nodes: [] })
  await page.addInitScript((stored) => {
    if (localStorage.getItem('dg:index')) return
    localStorage.setItem('dg:diagram:d_newer', stored)
    localStorage.setItem(
      'dg:index',
      JSON.stringify([{ id: 'd_newer', name: 'From a newer app', updatedAt: 1, nodeCount: 0, flowCount: 0 }]),
    )
  }, text)
  await page.goto('/')
  await expect(page.getByText('This diagram cannot be read')).toBeVisible()

  await diagramCard(page, 'From a newer app').getByRole('button', { name: 'Diagram actions' }).click()
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()
  await expect(page.getByText('Could not duplicate the diagram.')).toBeVisible()
  await expect(page.locator('#diagrams-heading + span')).toHaveText('1')

  await diagramCard(page, 'From a newer app').getByRole('button', { name: 'Diagram actions' }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export diagram file' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('from-a-newer-app.diagram.json')
  expect(readFileSync(await download.path(), 'utf8')).toBe(text)
})

test('backs up all diagrams to one zip file, and the import brings them back without overwriting', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('link', { name: 'All diagrams' }).click()
  await diagramCard(page, 'Order system').getByRole('button', { name: 'Diagram actions' }).click()
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()
  await expect(page.getByRole('link', { name: 'Order system copy', exact: true })).toBeVisible()
  const count = page.locator('#diagrams-heading + span')
  const stored = Number(await count.textContent())
  expect(stored).toBeGreaterThanOrEqual(2)

  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Back up all diagrams' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toMatch(/^diagrams-backup-\d{4}-\d{2}-\d{2}\.zip$/)
  const backup = await download.path()

  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Start from a template that is already playing' })).toBeVisible()

  await importFile(page, backup)
  const dialog = page.getByRole('dialog', { name: 'Import a diagram' })
  await expect(dialog.getByText(`Imported ${stored} diagrams.`)).toBeVisible()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(count).toHaveText(String(stored))
  await expect(page.getByRole('link', { name: 'Order system', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Order system copy', exact: true })).toBeVisible()

  await diagramCard(page, 'Order system').getByRole('button', { name: 'Diagram actions' }).click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  const renaming = page.getByRole('dialog', { name: 'Rename diagram' })
  await renaming.getByRole('textbox', { name: 'Diagram name' }).fill('Order system, changed here')
  await renaming.getByRole('button', { name: 'Rename' }).click()
  await expect(page.getByRole('link', { name: 'Order system, changed here', exact: true })).toBeVisible()

  await importFile(page, backup)
  await expect(dialog.getByText('Imported 1 diagram.')).toBeVisible()
  await expect(dialog.getByText('1 of them is a copy.')).toBeVisible()
  await expect(dialog.getByText(/^Skipped \d+ diagrams? that (is|are) already in your library\.$/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(count).toHaveText(String(stored + 1))
  await expect(page.getByRole('link', { name: 'Order system, changed here', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Order system', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Order system copy', exact: true })).toHaveCount(1)
})
