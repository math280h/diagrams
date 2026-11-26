import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { DIAGRAM_VERSION, type Diagram } from '@/model/schema'
import { DiagramBuilder } from '@/templates/builder'
import { diagramFile, expect, launchApp, test } from './fixtures'

const SAVE_WAIT_MS = 2000
// On macOS, Chromium reads Control with a wheel as a trackpad pinch. The editor zooms with Command and the wheel there.
const ZOOM_KEY = process.platform === 'darwin' ? 'Meta' : 'Control'
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

test('keeps a pan and a zoom on this computer and does not write them to the file', async ({ window, dirs }) => {
  const { diagram, file } = twoCards('Shop to look at')
  const target = path.join(dirs.data, `${file.id}.diagram.json`)
  writeFileSync(target, file.text)
  await window.reload()
  await expect(window.getByText(diagram.name)).toBeVisible({ timeout: 10_000 })
  const openDiagram = () =>
    window.evaluate((id) => {
      location.hash = `#/d/${id}`
    }, file.id)
  await openDiagram()
  await expect(window.getByLabel('Diagram name')).toHaveValue(diagram.name)
  await expect.poll(() => readFileSync(target, 'utf8')).toContain('"$schema"')
  await window.waitForTimeout(SAVE_WAIT_MS)
  const before = readFileSync(target, 'utf8')
  const modifiedMs = statSync(target).mtimeMs

  const viewport = window.locator('[data-editor-canvas] .react-flow__viewport')
  const box = (await window.locator('[data-editor-canvas]').boundingBox())!
  await window.mouse.move(box.x + box.width / 2, box.y + 40)
  await window.mouse.down()
  await window.mouse.move(box.x + box.width / 2 - 160, box.y + 120, { steps: 8 })
  await window.mouse.up()
  await window.keyboard.down(ZOOM_KEY)
  await window.mouse.wheel(0, -200)
  await window.keyboard.up(ZOOM_KEY)
  await window.waitForTimeout(SAVE_WAIT_MS)
  const moved = await viewport.getAttribute('style')
  expect(await window.evaluate(() => localStorage.getItem('dg:views'))).toContain(file.id)
  expect(readFileSync(target, 'utf8')).toBe(before)
  expect(statSync(target).mtimeMs).toBe(modifiedMs)

  await window.getByRole('link', { name: 'All diagrams' }).click()
  await expect(window.getByText(diagram.name)).toBeVisible()
  await openDiagram()
  await expect(viewport).toHaveAttribute('style', moved!)
  expect(readFileSync(target, 'utf8')).toBe(before)
})

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

const linkedOnDisk = (userData: string) => {
  const list = path.join(userData, 'linked-files.json')
  return existsSync(list) ? (JSON.parse(readFileSync(list, 'utf8')) as { files: string[] }).files : []
}

test('opens a file of the diagrams folder from its folder entry, and shows it once', async ({ app, window, dirs }) => {
  const inFolder = diagramFile('Opened from the folder', 'd_opened_from_folder')
  const target = path.join(dirs.data, `${inFolder.id}.diagram.json`)
  writeFileSync(target, inFolder.text)
  await window.reload()
  await expect(window.getByText('Opened from the folder')).toBeVisible()
  const name = process.platform === 'linux' ? path.basename(target) : path.basename(target).toUpperCase()
  await app.evaluate(
    ({ dialog }, picked) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [picked] })
    },
    path.join(dirs.data, 'themes', '..', name),
  )

  await window.getByRole('button', { name: 'Open a diagram file' }).click()
  await expect(window.getByLabel('Diagram name')).toHaveValue('Opened from the folder')
  await expect(window.getByRole('button', { name: /^Saved in / })).toHaveCount(0)
  await window.getByRole('link', { name: 'All diagrams' }).click()
  await expect(window.getByText('Opened from the folder')).toHaveCount(1)
  expect(linkedOnDisk(dirs.userData)).toEqual([])
})

test('saves a diagram as a file in the diagrams folder as a folder file', async ({ app, window, dirs }) => {
  const original = diagramFile('Before the copy', 'd_before_copy')
  writeFileSync(path.join(dirs.data, `${original.id}.diagram.json`), original.text)
  await window.reload()
  await window.evaluate((id) => {
    location.hash = `#/d/${id}`
  }, original.id)
  await expect(window.getByLabel('Diagram name')).toHaveValue('Before the copy')
  const copy = path.join(dirs.data, 'Copy in the folder.diagram.json')
  await app.evaluate(({ dialog }, picked) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: picked })
  }, copy)

  await window.getByRole('button', { name: 'Export' }).click()
  await window.getByRole('menuitem', { name: 'Save as a file…' }).click()
  await expect.poll(() => existsSync(copy)).toBe(true)
  await expect.poll(() => window.evaluate(() => decodeURIComponent(location.hash))).toBe('#/d/Copy in the folder')
  await expect(window.getByRole('button', { name: /^Saved in / })).toHaveCount(0)
  await window.getByLabel('Diagram name').fill('Renamed copy')
  await window.getByLabel('Diagram name').press('Enter')
  await expect.poll(() => nameOnDisk(copy)).toBe('Renamed copy')
  expect(nameOnDisk(path.join(dirs.data, `${original.id}.diagram.json`))).toBe('Before the copy')

  await window.getByRole('link', { name: 'All diagrams' }).click()
  await expect(window.getByText('Renamed copy')).toHaveCount(1)
  await expect(window.getByText('Before the copy')).toHaveCount(1)
  expect(linkedOnDisk(dirs.userData)).toEqual([])
})

test('takes a file of the diagrams folder off the list of opened files, and keeps the file', async ({
  appEnv,
  dirs,
}) => {
  mkdirSync(dirs.data, { recursive: true })
  const inFolder = diagramFile('Linked by an earlier version', 'd_linked_earlier')
  const target = path.join(dirs.data, `${inFolder.id}.diagram.json`)
  writeFileSync(target, inFolder.text)
  const { file: outside } = repoWithDiagram(path.dirname(dirs.data), 'Outside the folder')
  mkdirSync(dirs.userData, { recursive: true })
  writeFileSync(path.join(dirs.userData, 'linked-files.json'), JSON.stringify({ files: [target, outside] }))

  const { app, window } = await launchApp(appEnv)
  try {
    await expect(window.getByText('Outside the folder')).toBeVisible()
    await expect(window.getByText('Linked by an earlier version')).toHaveCount(1)
    await expect.poll(() => linkedOnDisk(dirs.userData)).toEqual([outside])
    expect(readFileSync(target, 'utf8')).toBe(inFolder.text)
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
