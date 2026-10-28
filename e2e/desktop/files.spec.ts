import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { diagramFile, expect, test } from './fixtures'

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
