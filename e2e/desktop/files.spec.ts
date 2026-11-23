import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { diagramFile, expect, launchApp, test } from './fixtures'

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
