import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { _electron as electron } from '@playwright/test'
import { AGENT_ENDPOINT } from '@/desktop/constants'
import { agentUrl, callTool, diagramFile, expect, test } from './fixtures'

test('keeps diagrams as files in the diagrams folder', async ({ window, dirs }) => {
  await expect(window.getByRole('button', { name: 'New diagram' })).toBeVisible()
  await window.getByRole('button', { name: 'New diagram' }).click()
  await expect(window).toHaveURL(/#\/d\//)
  const id = decodeURIComponent(window.url().split('#/d/')[1] ?? '')
  await expect.poll(() => existsSync(path.join(dirs.data, `${id}.diagram.json`))).toBe(true)

  await window.getByLabel('Diagram name').fill('Saved as a file')
  await window.getByLabel('Diagram name').press('Enter')
  await window.reload()
  await expect(window.getByLabel('Diagram name')).toHaveValue('Saved as a file')

  await window.getByRole('link', { name: 'All diagrams' }).click()
  await expect(window.getByText(`Saved as files in ${dirs.data}`)).toBeVisible()
})

test('deletes the file of a new diagram that the user leaves empty', async ({ window, dirs }) => {
  await window.getByRole('button', { name: 'New diagram' }).click()
  await expect(window).toHaveURL(/#\/d\//)
  const id = decodeURIComponent(window.url().split('#/d/')[1] ?? '')
  const file = path.join(dirs.data, `${id}.diagram.json`)
  await expect.poll(() => existsSync(file)).toBe(true)

  await window.getByRole('link', { name: 'All diagrams' }).click()
  await expect.poll(() => existsSync(file)).toBe(false)
  await expect(window.getByRole('heading', { name: /Draw how your system works/ })).toBeVisible()
})

test('shows a diagram file that another program adds to the folder', async ({ window, dirs }) => {
  await expect(window.getByRole('button', { name: 'New diagram' })).toBeVisible()
  const file = diagramFile('Added from outside')
  writeFileSync(path.join(dirs.data, `${file.id}.diagram.json`), file.text)
  await expect(window.getByText('Added from outside')).toBeVisible({ timeout: 10_000 })
  expect(readdirSync(dirs.data).filter((name) => name.endsWith('.diagram.json'))).toHaveLength(1)
})

test('quits through the app quit command after it writes the last change', async ({ appEnv, dirs }) => {
  const app = await electron.launch({ args: ['.'], env: appEnv })
  const window = await app.firstWindow()
  await window.getByRole('button', { name: 'New diagram' }).click()
  await expect(window).toHaveURL(/#\/d\//)
  const id = decodeURIComponent(window.url().split('#/d/')[1] ?? '')
  const file = path.join(dirs.data, `${id}.diagram.json`)
  await expect.poll(() => existsSync(file)).toBe(true)

  await window.getByLabel('Diagram name').fill('Written before the quit')
  await window.getByLabel('Diagram name').press('Enter')
  const exited = new Promise<void>((resolve) => app.process().once('exit', () => resolve()))
  await app.evaluate(({ app: electronApp }) => electronApp.quit())
  await Promise.race([
    exited,
    new Promise((_, reject) => setTimeout(() => reject(new Error('The app did not quit.')), 15_000)),
  ])
  expect(JSON.parse(readFileSync(file, 'utf8')).name).toBe('Written before the quit')
})

test('explains a diagrams folder that it cannot open, and answers agents at once', async ({
  appEnv,
  dirs,
  agentPort,
}) => {
  writeFileSync(dirs.data, 'A file where the diagrams folder should be')
  const app = await electron.launch({ args: ['.'], env: appEnv })
  const client = new Client({ name: 'e2e', version: '1.0.0' })
  try {
    const window = await app.firstWindow()
    await expect(window.getByRole('alert')).toContainText('could not open your diagrams folder', { timeout: 30_000 })
    await expect(window.getByRole('button', { name: 'Try again' })).toBeVisible()

    const token = readFileSync(path.join(dirs.userData, 'agent-token'), 'utf8').trim()
    await expect
      .poll(async () => {
        try {
          await client.connect(
            new StreamableHTTPClientTransport(new URL(`${agentUrl(agentPort)}${AGENT_ENDPOINT}`), {
              requestInit: { headers: { Authorization: `Bearer ${token}` } },
            }),
          )
          return true
        } catch {
          return false
        }
      })
      .toBe(true)
    const started = Date.now()
    await expect(callTool(client, 'list_diagrams')).rejects.toThrow('could not open the diagrams folder')
    expect(Date.now() - started).toBeLessThan(5000)
  } finally {
    await client.close()
    await app.close()
  }
})

test('gives the window an app icon that Electron can read', async ({ app }) => {
  const size = await app.evaluate(({ nativeImage }, file) => nativeImage.createFromPath(file).getSize(), iconFile())
  expect(size.width).toBeGreaterThanOrEqual(256)
})

function iconFile() {
  return path.resolve('build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
}

test('serves the player files that the web page export puts in a page', async ({ window }) => {
  const files = await window.evaluate(() =>
    Promise.all(
      ['standalone/player.js', 'standalone/player.css', 'standalone/licenses.txt'].map(async (file) => {
        const response = await fetch(`/${file}`)
        return {
          status: response.status,
          type: response.headers.get('content-type'),
          size: (await response.text()).length,
        }
      }),
    ),
  )
  expect(files.map(({ status, type }) => [status, type?.split(';')[0]])).toEqual([
    [200, 'text/javascript'],
    [200, 'text/css'],
    [200, 'text/plain'],
  ])
  expect(files.every(({ size }) => size > 1000)).toBe(true)
})
