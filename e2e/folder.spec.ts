import { AGENT_PORTS } from '@/desktop/constants'
import { expect, test, type Page } from './fixtures'
import { copyTemplate, isAgentUrl } from './helpers'

const FOLDER = 'project'

test.beforeEach(async ({ page }) => {
  await page.addInitScript((name) => {
    Object.assign(window, {
      showDirectoryPicker: async () =>
        (await navigator.storage.getDirectory()).getDirectoryHandle(name, { create: true }),
    })
  }, FOLDER)
})

function readFile(page: Page, path: string) {
  return page.evaluate(
    async ({ folder, file }) => {
      try {
        let directory = await (await navigator.storage.getDirectory()).getDirectoryHandle(folder)
        const parts = file.split('/')
        for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part)
        return await (await (await directory.getFileHandle(parts.at(-1)!)).getFile()).text()
      } catch {
        return null
      }
    },
    { folder: FOLDER, file: path },
  )
}

function writeFile(page: Page, path: string, text: string) {
  return page.evaluate(
    async ({ folder, file, content }) => {
      let directory = await (await navigator.storage.getDirectory()).getDirectoryHandle(folder)
      const parts = file.split('/')
      for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part, { create: true })
      const writable = await (await directory.getFileHandle(parts.at(-1)!, { create: true })).createWritable()
      await writable.write(content)
      await writable.close()
    },
    { folder: FOLDER, file: path, content: text },
  )
}

function openDiagramId(page: Page) {
  return decodeURIComponent(/#\/d\/([^/?]+)/.exec(page.url())![1]!)
}

async function readDiagramFile(page: Page, id: string) {
  let text: string | null = null
  await expect
    .poll(async () => {
      text = await readFile(page, `${id}.diagram.json`)
      return text
    })
    .not.toBeNull()
  return JSON.parse(text!) as { id: string; name: string }
}

test('keeps the diagrams as files in an opened folder and shows the changes from outside', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Checkout flow')
  await page.goto('/')
  await page.getByRole('button', { name: 'Open a folder' }).click()
  await expect(page.getByText(`Saved as files in the folder ${FOLDER}`)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your diagrams', exact: true })).toHaveCount(0)

  await copyTemplate(page, 'Order system')
  const id = openDiagramId(page)
  await expect.poll(() => readFile(page, `${id}.diagram.json`)).toContain('"name": "Order system"')

  const file = await readDiagramFile(page, id)
  await writeFile(page, `${id}.diagram.json`, JSON.stringify({ ...file, name: 'Changed in an editor' }))
  await expect(page.getByLabel('Diagram name')).toHaveValue('Changed in an editor')

  await page.goto('/')
  await page.getByRole('button', { name: 'Close folder' }).click()
  await expect(page.getByText('used in this browser')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your diagrams', exact: true })).toBeVisible()
  await expect(page.getByText('Changed in an editor')).toHaveCount(0)
})

test('copies the open diagram into a folder from the agent button of the editor', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  const id = openDiagramId(page)
  await page.getByRole('button', { name: 'Connect an agent' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('This browser supports folders')).toBeVisible()
  await dialog.getByRole('button', { name: 'Open a folder and copy “Order system”' }).click()

  await expect(page.getByRole('dialog')).toContainText('.diagrams/README.md in the "project" folder', {
    timeout: 20_000,
  })
  expect(openDiagramId(page)).toBe(id)
  await expect(page.getByLabel('Diagram name')).toHaveValue('Order system')
  expect(await readFile(page, `${id}.diagram.json`)).toContain('"name": "Order system"')
})

test('finds a desktop app on any agent port, then opens on its tab, with the install steps before', async ({
  page,
}) => {
  const appChecks: string[] = []
  let answeringPort: number | null = null
  const desktopTab = async () => {
    await page.getByRole('button', { name: 'a folder of your project' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('tab', { name: 'In this browser' })).toHaveAttribute('aria-selected', 'true')
    expect(appChecks).toHaveLength(0)
    await dialog.getByRole('tab', { name: 'Desktop app' }).click()
    return dialog
  }
  page.on('request', (request) => {
    if (isAgentUrl(new URL(request.url()))) appChecks.push(request.url())
  })
  await page.route(isAgentUrl, (route) =>
    Number(new URL(route.request().url()).port) === answeringPort ? route.fulfill({ status: 404 }) : route.abort(),
  )

  await page.goto('/')
  let dialog = await desktopTab()
  await expect(dialog.getByText('1. Install the desktop app.')).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'Connect an agent in the app' })).toHaveAttribute(
    'href',
    'diagrams://connect-agent',
  )
  expect(new Set(appChecks)).toEqual(new Set(AGENT_PORTS.map((port) => `http://127.0.0.1:${port}/handoff`)))

  answeringPort = AGENT_PORTS[6]!
  await page.reload()
  appChecks.length = 0
  dialog = await desktopTab()
  await expect(dialog.getByText('The desktop app is running on this computer')).toBeVisible()
  await expect(dialog.getByText('1. Install the desktop app.')).toHaveCount(0)
  await expect(dialog.getByRole('link', { name: 'Connect an agent in the app' })).toHaveAttribute(
    'href',
    'diagrams://connect-agent',
  )

  answeringPort = null
  await page.reload()
  await page.getByRole('button', { name: 'a folder of your project' }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('tab', { name: 'Desktop app' })).toHaveAttribute('aria-selected', 'true')
  await expect(dialog.getByText('You have used the desktop app from this browser')).toBeVisible()
})

test('lets an agent call the tools and read the checks through the agent folder', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'a folder of your project' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Open a folder' }).click()
  await expect(page.getByRole('dialog')).toContainText('.diagrams/README.md in the "project" folder')
  await page.keyboard.press('Escape')
  await expect(page.getByText(`Saved as files in the folder ${FOLDER}`)).toBeVisible()
  await expect
    .poll(() => readFile(page, '.diagrams/README.md'), { timeout: 20_000 })
    .toContain('# Diagrams in this folder')
  expect(await readFile(page, '.diagrams/icons.txt')).toContain('aws:')
  expect(await readFile(page, '.diagrams/skills/architecture/SKILL.md')).not.toBeNull()

  await writeFile(
    page,
    '.diagrams/calls/001-create.json',
    JSON.stringify({ tool: 'create_diagram', args: { name: 'Drawn by an agent', template: 'order-system' } }),
  )
  await expect.poll(() => readFile(page, '.diagrams/results/001-create.json'), { timeout: 20_000 }).not.toBeNull()
  expect(JSON.parse((await readFile(page, '.diagrams/results/001-create.json'))!)).toMatchObject({
    tool: 'create_diagram',
    ok: true,
  })
  expect(await readFile(page, '.diagrams/calls/001-create.json')).toBeNull()
  await expect(page.getByLabel('Diagram name')).toHaveValue('Drawn by an agent')
  await expect(page.getByRole('button', { name: 'Connect an agent' })).toBeVisible()

  const id = openDiagramId(page)
  const file = await readDiagramFile(page, id)
  await writeFile(page, `${id}.diagram.json`, JSON.stringify({ ...file, name: 'Changed by the agent' }))
  await expect
    .poll(() => readFile(page, `.diagrams/status/${id}.md`), { timeout: 30_000 })
    .toContain('The website opened "Changed by the agent"')
  await expect.poll(() => readFile(page, `.diagrams/status/${id}.png`), { timeout: 30_000 }).not.toBeNull()
})
