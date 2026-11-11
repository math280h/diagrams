import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { IPC_CHANNELS } from '@/desktop/contract'
import { AGENT_ENDPOINT } from '@/desktop/constants'
import { copyTemplate } from '../helpers'
import { agentUrl, callTool, diagramFile, expect, test } from './fixtures'

/** The time for the agent server to start next to a startup error, on a slow test machine. */
const AGENT_START_WAIT_MS = 20_000

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

function untilExit(app: ElectronApplication) {
  const exited = new Promise<void>((resolve) => app.process().once('exit', () => resolve()))
  return Promise.race([
    exited,
    new Promise((_, reject) => setTimeout(() => reject(new Error('The app did not quit.')), 15_000)),
  ])
}

async function closeWindow(app: ElectronApplication, window: Page) {
  await (await app.browserWindow(window)).evaluate((browserWindow) => browserWindow.close())
}

test('quits from the command menu after it writes the last change', async ({ appEnv, dirs }) => {
  const app = await electron.launch({ args: ['.'], env: appEnv })
  const window = await app.firstWindow()
  await window.getByRole('button', { name: 'New diagram' }).click()
  await expect(window).toHaveURL(/#\/d\//)
  const id = decodeURIComponent(window.url().split('#/d/')[1] ?? '')
  const file = path.join(dirs.data, `${id}.diagram.json`)
  await expect.poll(() => existsSync(file)).toBe(true)

  await window.getByLabel('Diagram name').fill('Written before the quit')
  await window.getByLabel('Diagram name').press('Enter')
  const exit = untilExit(app)
  await window.keyboard.press('Control+k')
  await window.getByPlaceholder('Search for an action').fill('quit')
  await window.getByRole('option', { name: 'Quit Diagrams' }).click()
  await exit
  expect(JSON.parse(readFileSync(file, 'utf8')).name).toBe('Written before the quit')
})

test('keeps the agent server after the window closes, and opens a window for the next agent call', async ({
  app,
  window,
  mcp,
}) => {
  const closed = window.waitForEvent('close')
  await closeWindow(app, window)
  await closed
  expect(app.process().exitCode).toBeNull()

  const reopened = app.waitForEvent('window')
  const { json } = await callTool(mcp, 'list_diagrams')
  expect(json).toHaveProperty('diagrams')
  await reopened
})

test('quits when the window closes after the user turns off keep running', async ({ appEnv, dirs }) => {
  const app = await electron.launch({ args: ['.'], env: appEnv })
  const window = await app.firstWindow()
  await window.getByRole('banner').getByRole('button', { name: 'Connect an agent' }).click()
  const keepRunning = window.getByRole('switch', { name: 'Keep running when the window closes' })
  await expect(keepRunning).toBeChecked()
  await keepRunning.click()
  await expect(keepRunning).not.toBeChecked()
  const settings = path.join(dirs.userData, 'app-settings.json')
  expect(JSON.parse(readFileSync(settings, 'utf8'))).toMatchObject({ keepRunning: false })

  const exit = untilExit(app)
  await closeWindow(app, window)
  await exit
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
    await window.getByRole('button', { name: 'More details…' }).click()
    const problem = window.getByRole('dialog', { name: 'The app could not open your diagrams folder' })
    await expect(problem.locator('code')).toContainText('Storage: diagrams folder')
    await expect(problem.getByRole('link', { name: 'Report a problem' })).toBeVisible()
    await window.keyboard.press('Escape')

    const token = readFileSync(path.join(dirs.userData, 'agent-token'), 'utf8').trim()
    await expect
      .poll(
        async () => {
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
        },
        { timeout: AGENT_START_WAIT_MS },
      )
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

test('gives the macOS menu bar a template icon with a high resolution file that Electron can read', async ({ app }) => {
  const image = await app.evaluate(
    ({ nativeImage }, file) => {
      const icon = nativeImage.createFromPath(file)
      return { size: icon.getSize(), scaleFactors: icon.getScaleFactors() }
    },
    path.resolve('build', 'trayTemplate.png'),
  )
  expect(image.size).toEqual({ width: 18, height: 18 })
  expect(image.scaleFactors).toEqual([1, 2])
})

function iconFile() {
  return path.resolve('build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
}

test('colours the window buttons like the header, or with the window colours of the theme', async ({
  app,
  window,
}) => {
  test.skip(process.platform === 'darwin', 'macOS draws its own window buttons.')
  await expect(window.getByRole('button', { name: 'New diagram' })).toBeVisible()
  await app.evaluate(({ BrowserWindow }) => {
    const calls: unknown[] = []
    const borders: unknown[] = []
    Object.assign(globalThis, { titleBarCalls: calls, borderCalls: borders })
    const main = BrowserWindow.getAllWindows()[0]!
    const setOverlay = main.setTitleBarOverlay.bind(main)
    main.setTitleBarOverlay = (options) => {
      calls.push(options)
      setOverlay(options)
    }
    const setAccent = main.setAccentColor.bind(main)
    main.setAccentColor = (color) => {
      borders.push(color)
      setAccent(color)
    }
  })
  const lastColors = () =>
    app.evaluate(() =>
      (globalThis as unknown as { titleBarCalls: { color: string; symbolColor: string }[] }).titleBarCalls.at(-1),
    )
  const lastBorder = () => app.evaluate(() => (globalThis as unknown as { borderCalls: unknown[] }).borderCalls.at(-1))
  const startWithTheme = async (mode: 'dark' | 'light', darkTheme = 'dark') => {
    await window.evaluate(
      ({ themeMode, dark }) => {
        const saved = JSON.parse(localStorage.getItem('dg:settings') ?? '{"state":{},"version":1}') as {
          state: Record<string, unknown>
        }
        const state = { ...saved.state, themeMode, themes: { light: 'light', dark } }
        localStorage.setItem('dg:settings', JSON.stringify({ state, version: 1 }))
      },
      { themeMode: mode, dark: darkTheme },
    )
    await window.reload()
    await expect(window.getByRole('button', { name: 'New diagram' })).toBeVisible()
  }

  await startWithTheme('dark', 'blueprint')
  await expect.poll(lastColors).toMatchObject({ color: '#0f2a4e', symbolColor: '#f2f6fc' })
  if (process.platform === 'win32') await expect.poll(lastBorder).toBe('#ffd84a')
  await startWithTheme('dark')
  await expect.poll(lastColors).toMatchObject({ color: '#0a0a0a', symbolColor: '#fafafa' })
  if (process.platform === 'win32') await expect.poll(lastBorder).toBeNull()
  await startWithTheme('light')
  await expect.poll(lastColors).toMatchObject({ color: '#ffffff', symbolColor: '#0a0a0a' })
})

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

test('registers no service worker and offers no install of the website', async ({ window }) => {
  await expect(window.getByRole('button', { name: 'New diagram' })).toBeVisible()
  const registrations = await window.evaluate(async () =>
    'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations().catch(() => [])).length : 0,
  )
  expect(registrations).toBe(0)
  await expect(window.getByRole('region', { name: 'Install this website as an app' })).toHaveCount(0)
})

test('holds the playing template while the window is minimized or hidden', async ({ app, window }) => {
  const report = (visible: boolean) =>
    app.evaluate(
      ({ BrowserWindow }, { channel, value }) =>
        BrowserWindow.getAllWindows()[0]?.webContents.send(channel, {
          name: 'window.visibility',
          payload: { visible: value },
        }),
      { channel: IPC_CHANNELS.event, value: visible },
    )
  const caption = window.locator('.dg-caption').first()
  await expect(caption).not.toHaveText('', { timeout: 10_000 })
  await report(false)
  const held = await caption.textContent()
  await window.waitForTimeout(2500)
  await expect(caption).toHaveText(held!)
  await report(true)
  await expect(caption).not.toHaveText(held!, { timeout: 6000 })
})

test('makes a share link for the website and opens such a link itself', async ({ window }) => {
  await copyTemplate(window, 'Checkout flow')
  await window.getByRole('button', { name: 'Export' }).click()
  await window.getByRole('menuitem', { name: 'Share link' }).click()
  const link = window.getByRole('textbox', { name: 'Share link' })
  await expect(link).toHaveValue(/^https:\/\/draw\.thias\.dev\/#\/s\/y[\w-]+x$/, { timeout: 15_000 })
  const data = (await link.inputValue()).split('#/s/')[1]!
  await window.keyboard.press('Escape')
  await window.evaluate((hash) => {
    location.hash = hash
  }, `#/s/${data}`)
  await expect(window.getByRole('heading', { name: 'Checkout flow' })).toBeVisible()
  await expect(window.locator('.react-flow__node')).toHaveCount(7)
})
