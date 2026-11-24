import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { DIAGRAM_VERSION, type Diagram } from '@/model/schema'
import { DiagramBuilder } from '@/templates/builder'
import { diagramFile, expect, launchApp, test } from './fixtures'

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

async function openWithPausedClock(window: Page, folder: string, name: string, file = diagramFile(name)) {
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

function twoCards(name: string) {
  const b = new DiagramBuilder()
  const api = b.card(0, 0, { title: 'API' })
  const db = b.card(400, 0, { title: 'Orders DB' })
  b.edge(api, db, { label: 'SQL' })
  const diagram = { ...b.build(name), id: 'd_e2e_merge' }
  return { diagram, file: { id: diagram.id, text: JSON.stringify(diagram) }, api, db }
}

function pulled(diagram: Diagram, recipe: (draft: Diagram) => void) {
  const draft = structuredClone(diagram)
  recipe(draft)
  return JSON.stringify(draft)
}

const nodeOnDisk = (target: string, id: string) =>
  (JSON.parse(readFileSync(target, 'utf8')) as Diagram).nodes.find((node) => node.id === id)

async function renameCard(window: Page, label: string, name: string) {
  await window.locator('[data-editor-canvas]').locator(`[aria-label="${label}, service"]`).click()
  const field = window.getByRole('complementary', { name: 'Properties' }).getByRole('textbox', { name: 'Name' })
  await field.fill(name)
  await field.press('Tab')
}

test('merges a file that changed on disk with an edit that waits', async ({ window, dirs }) => {
  const { diagram, file, api, db } = twoCards('Shop before the pull')
  const { target } = await openWithPausedClock(window, dirs.data, diagram.name, file)
  await renameCard(window, 'API', 'Gateway')
  writeFileSync(
    target,
    pulled(diagram, (draft) => void (draft.nodes.find((node) => node.id === db)!.position = { x: 400, y: 200 })),
  )
  await expectNoticeBeforeSave(window, window.getByText('This diagram changed on disk.'))
  await window.clock.runFor(SAVE_WAIT_MS)
  expect(nodeOnDisk(target, api)).toMatchObject({ data: { title: 'API' } })

  await window.locator('[data-sonner-toast]').getByRole('button', { name: 'Merge' }).click()
  await window.clock.runFor(SAVE_WAIT_MS)
  await expect.poll(() => nodeOnDisk(target, api)).toMatchObject({ data: { title: 'Gateway' } })
  expect(nodeOnDisk(target, db)?.position).toEqual({ x: 400, y: 200 })
})

test('reviews a conflict with a file that changed on disk, and applies the side that the user picks', async ({
  window,
  dirs,
}) => {
  const { diagram, file, api, db } = twoCards('Shop before the review')
  const { target } = await openWithPausedClock(window, dirs.data, diagram.name, file)
  await renameCard(window, 'API', 'Gateway')
  writeFileSync(
    target,
    pulled(diagram, (draft) => {
      const card = draft.nodes.find((node) => node.id === api)
      if (card?.type === 'card') card.data.title = 'Edge API'
      draft.nodes.find((node) => node.id === db)!.position = { x: 400, y: 200 }
    }),
  )
  await expectNoticeBeforeSave(window, window.getByText('1 change needs a choice before your changes save.'))
  await window.locator('[data-sonner-toast]').getByRole('button', { name: 'Review' }).click()

  for (const pane of ['Yours', 'On disk', 'Result'])
    await expect(window.getByRole('region', { name: pane })).toBeVisible()
  const panel = window.getByRole('complementary', { name: 'Review the changes' })
  await expect(panel.getByText('1 of 1 need a choice')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Apply' })).toBeDisabled()
  await panel.getByRole('group', { name: 'Choice for Gateway, title' }).getByRole('button', { name: 'Disk' }).click()
  await expect(panel.getByText('All chosen')).toBeVisible()
  await panel.getByRole('button', { name: 'Apply' }).click()
  await expect(panel).toHaveCount(0)

  await window.clock.runFor(SAVE_WAIT_MS)
  await expect.poll(() => nodeOnDisk(target, api)).toMatchObject({ data: { title: 'Edge API' } })
  expect(nodeOnDisk(target, db)?.position).toEqual({ x: 400, y: 200 })
})

async function openReview(window: Page) {
  await expectNoticeBeforeSave(window, window.getByText('1 change needs a choice before your changes save.'))
  await window.locator('[data-sonner-toast]').getByRole('button', { name: 'Review' }).click()
  return window.getByRole('complementary', { name: 'Review the changes' })
}

test('applies a name that the user types for a node that both sides renamed', async ({ window, dirs }) => {
  const { diagram, file, api } = twoCards('Shop before the rename')
  const { target } = await openWithPausedClock(window, dirs.data, diagram.name, file)
  await renameCard(window, 'API', 'Gateway')
  writeFileSync(
    target,
    pulled(diagram, (draft) => {
      const card = draft.nodes.find((node) => node.id === api)
      if (card?.type === 'card') card.data.title = 'Edge API'
    }),
  )
  const panel = await openReview(window)
  await panel.getByRole('group', { name: 'Choice for Gateway, title' }).getByRole('button', { name: 'Edit' }).click()
  const typed = panel.getByRole('textbox', { name: 'New title for Gateway' })
  await expect(typed).toHaveValue('Gateway')
  await typed.fill('Edge gateway')
  await typed.press('Enter')
  await panel.getByRole('button', { name: 'Apply' }).click()

  await window.clock.runFor(SAVE_WAIT_MS)
  await expect.poll(() => nodeOnDisk(target, api)).toMatchObject({ data: { title: 'Edge gateway' } })
})

test('keeps the lines that both sides added to a card', async ({ window, dirs }) => {
  const { diagram, file, api } = twoCards('Shop before the lines')
  const { target } = await openWithPausedClock(window, dirs.data, diagram.name, file)
  await window.locator('[data-editor-canvas]').locator('[aria-label="API, service"]').click()
  const detail = window.getByRole('complementary', { name: 'Properties' }).getByRole('textbox', { name: 'Detail' })
  await detail.fill('GET /orders')
  await detail.press('Tab')
  writeFileSync(
    target,
    pulled(diagram, (draft) => {
      const card = draft.nodes.find((node) => node.id === api)
      if (card?.type === 'card') card.data.lines = [{ id: 'l_disk', text: 'POST /pay' }]
    }),
  )
  const panel = await openReview(window)
  await panel.getByRole('group', { name: 'Choice for API, lines' }).getByRole('button', { name: 'Both' }).click()
  await panel.getByRole('button', { name: 'Apply' }).click()

  await window.clock.runFor(SAVE_WAIT_MS)
  await expect
    .poll(() => {
      const card = nodeOnDisk(target, api)
      return card?.type === 'card' ? card.data.lines.map((line) => line.text) : []
    })
    .toEqual(['GET /orders', 'POST /pay'])
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

test('opens the library when the list of opened files is damaged, and tells the user', async ({ appEnv, dirs }) => {
  mkdirSync(dirs.data, { recursive: true })
  const inFolder = diagramFile('In the diagrams folder', 'd_in_folder')
  writeFileSync(path.join(dirs.data, `${inFolder.id}.diagram.json`), inFolder.text)
  mkdirSync(dirs.userData, { recursive: true })
  writeFileSync(path.join(dirs.userData, 'linked-files.json'), '{"files": ["')

  const { app, window } = await launchApp(appEnv)
  try {
    await expect(window.getByText('In the diagrams folder')).toBeVisible()
    const notice = window.locator('[data-sonner-toast]').filter({ hasText: 'The list of opened files was reset' })
    await expect(notice).toBeVisible()
    await expect(notice.getByRole('button', { name: 'Show the old list' })).toBeVisible()
    const copies = readdirSync(dirs.userData).filter((name) => name.startsWith('linked-files-damaged-'))
    expect(copies).toHaveLength(1)
    expect(readFileSync(path.join(dirs.userData, copies[0]!), 'utf8')).toBe('{"files": ["')
    expect(JSON.parse(readFileSync(path.join(dirs.userData, 'linked-files.json'), 'utf8'))).toEqual({ files: [] })
  } finally {
    await app.close()
  }
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
