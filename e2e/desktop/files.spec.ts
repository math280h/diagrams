import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { DIAGRAM_VERSION } from '@/model/schema'
import { diagramFile, expect, test } from './fixtures'

const SAVE_WAIT_MS = 2000
const APP_SAVE_DELAY_MS = 400
const NOTICE_STEP_MS = 16
const NOTICE_CLOCK_BUDGET_MS = APP_SAVE_DELAY_MS - 100

// Sonner shows a new toast from a timer, so the paused clock must move.
async function expectNoticeBeforeSave(window: Page, notice: Locator) {
  let advancedMs = 0
  await expect
    .poll(
      async () => {
        if (advancedMs < NOTICE_CLOCK_BUDGET_MS) {
          await window.clock.runFor(NOTICE_STEP_MS)
          advancedMs += NOTICE_STEP_MS
        }
        return notice.isVisible()
      },
      { timeout: 10_000 },
    )
    .toBe(true)
}

async function openWithPausedClock(window: Page, folder: string, name: string) {
  const file = diagramFile(name)
  const target = path.join(folder, `${file.id}.diagram.json`)
  writeFileSync(target, file.text)
  await window.clock.install()
  await window.reload()
  await expect(window.getByText(name)).toBeVisible({ timeout: 10_000 })
  await window.evaluate((id) => {
    location.hash = `#/d/${id}`
  }, file.id)
  await expect(window.getByLabel('Diagram name')).toHaveValue(name)
  await window.clock.pauseAt((await window.evaluate(() => Date.now())) + 1000)
  return { file, target }
}

const nameOnDisk = (target: string) => (JSON.parse(readFileSync(target, 'utf8')) as { name: string }).name

test('keeps a file that changed on disk while an edit waits, until the user loads it', async ({ window, dirs }) => {
  const { file, target } = await openWithPausedClock(window, dirs.data, 'Before the pull')
  await window.getByLabel('Diagram name').fill('Edit that waits')
  await window.getByLabel('Diagram name').press('Enter')
  writeFileSync(target, JSON.stringify({ ...JSON.parse(file.text), name: 'After the pull' }))
  await expectNoticeBeforeSave(window, window.getByText('This diagram changed on disk.'))

  await window.clock.runFor(SAVE_WAIT_MS)
  expect(nameOnDisk(target)).toBe('After the pull')
  await window.getByRole('button', { name: 'Load newer' }).click()
  await expect(window.getByLabel('Diagram name')).toHaveValue('After the pull')

  await window.getByLabel('Diagram name').fill('Edited after the load')
  await window.getByLabel('Diagram name').press('Enter')
  await window.clock.runFor(SAVE_WAIT_MS)
  await expect.poll(() => nameOnDisk(target)).toBe('Edited after the load')
})

test('never writes over a file from a newer version of the app', async ({ window, dirs }) => {
  const { file, target } = await openWithPausedClock(window, dirs.data, 'Before the sync')
  const newer = JSON.stringify({ ...JSON.parse(file.text), version: DIAGRAM_VERSION + 1, name: 'From a newer app' })
  writeFileSync(target, newer)
  await expectNoticeBeforeSave(window, window.getByText('The newer version cannot be read.'))
  await expect(window.locator('[data-sonner-toast]').getByRole('button', { name: 'Export' })).toBeVisible()

  await window.getByLabel('Diagram name').fill('Edit after the sync')
  await window.getByLabel('Diagram name').press('Enter')
  await window.clock.runFor(SAVE_WAIT_MS)
  await window.getByRole('link', { name: 'All diagrams' }).click()
  await expect(window.getByText('From a newer app')).toBeVisible()
  expect(readFileSync(target, 'utf8')).toBe(newer)
})

function repoWithDiagram(root: string, name: string) {
  const repo = path.join(root, 'repo')
  const file = path.join(repo, 'docs', 'orders.diagram.json')
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, diagramFile(name, 'd_in_repo').text)
  return { repo, file }
}

function commitAll(repo: string) {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 't@x',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 't@x',
  }
  execFileSync('git', ['-C', repo, 'init', '-q'], { env })
  execFileSync('git', ['-C', repo, 'add', '.'], { env })
  execFileSync('git', ['-C', repo, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'Add the diagram'], { env })
}

test('opens a diagram file in a repository and saves it where it is', async ({ app, window, dirs }) => {
  const { file } = repoWithDiagram(path.dirname(dirs.data), 'Orders in the repo')
  await app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [picked] })
  }, file)

  await window.getByRole('button', { name: 'Open a diagram file' }).click()
  await expect(window.getByLabel('Diagram name')).toHaveValue('Orders in the repo')
  await expect(window.getByRole('button', { name: `Saved in ${file}` })).toBeVisible()

  await window.getByLabel('Diagram name').fill('Orders, renamed')
  await window.getByLabel('Diagram name').press('Enter')
  await expect.poll(() => JSON.parse(readFileSync(file, 'utf8')).name).toBe('Orders, renamed')
  expect(existsSync(path.join(dirs.data, 'd_in_repo.diagram.json'))).toBe(false)

  await window.getByRole('link', { name: 'All diagrams' }).click()
  await expect(window.getByText('docs/orders.diagram.json')).toBeVisible()
  await window.getByRole('button', { name: 'Diagram actions' }).click()
  await window.getByRole('menuitem', { name: 'Remove from library' }).click()
  await window.getByRole('button', { name: 'Remove from library' }).click()
  await expect(window.getByText('docs/orders.diagram.json')).toHaveCount(0)
  expect(JSON.parse(readFileSync(file, 'utf8')).name).toBe('Orders, renamed')
})

test('compares a diagram file with its last commit and restores it', async ({ app, window, dirs }) => {
  const { repo, file } = repoWithDiagram(path.dirname(dirs.data), 'Committed name')
  commitAll(repo)
  await app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [picked] })
  }, file)
  await window.getByRole('button', { name: 'Open a diagram file' }).click()
  await window.getByLabel('Diagram name').fill('Changed name')
  await window.getByLabel('Diagram name').press('Enter')

  await window.getByRole('button', { name: 'Version history' }).click()
  await window.getByRole('option', { name: /Last commit/ }).click()
  const status = window.getByRole('status').filter({ hasText: 'Last commit' })
  await expect(status).toContainText('Renamed the diagram to “Changed name”.')
  await status.getByRole('button', { name: 'Restore this version' }).click()
  await expect(window.getByLabel('Diagram name')).toHaveValue('Committed name')
  await expect.poll(() => JSON.parse(readFileSync(file, 'utf8')).name).toBe('Committed name')
})
