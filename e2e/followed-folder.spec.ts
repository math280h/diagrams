import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DIAGRAM_VERSION, type Diagram } from '@/model/schema'
import { expect, test } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const target of [window, Window.prototype]) {
      delete (target as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker
    }
  })
})

function folderWithDiagram(name: string) {
  const sample = JSON.parse(readFileSync(`src/persistence/formats/v${DIAGRAM_VERSION}.json`, 'utf8')) as {
    diagrams: Diagram[]
  }
  const diagram = sample.diagrams.find((candidate) => candidate.nodes.length > 0)!
  const folder = path.join(mkdtempSync(path.join(tmpdir(), 'followed-')), 'project')
  mkdirSync(folder)
  writeFileSync(path.join(folder, 'd_folder.diagram.json'), JSON.stringify({ ...diagram, id: 'd_folder', name }))
  writeFileSync(path.join(folder, 'notes.md'), '# Notes')
  return folder
}

test('shows a folder only to read in a browser without folder access, with the agent guide', async ({ page }) => {
  const folder = folderWithDiagram('In the folder')
  await page.goto('/')
  await page.getByRole('button', { name: 'a folder of your project' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('This browser can only read a folder')).toBeVisible()
  const chooser = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: 'Show a folder' }).click()
  await (await chooser).setFiles(folder)

  await expect(dialog).toContainText('read diagrams-guide.md in the "project" folder')
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download the guide' }).click()
  expect((await download).suggestedFilename()).toBe('diagrams-guide.md')
  await page.keyboard.press('Escape')

  await expect(page.getByText('only to read')).toBeVisible()
  await page.getByRole('link', { name: 'In the folder' }).first().click()
  await expect(page.getByLabel('Diagram name')).toHaveValue('In the folder')
  await expect(page.getByText('Read only', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'All diagrams' }).click()
  await page.getByRole('button', { name: 'Stop showing it' }).first().click()
  await expect(page.getByRole('link', { name: 'In the folder' })).toHaveCount(0)
})
