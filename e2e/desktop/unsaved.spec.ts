import { chmodSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { ElectronApplication, Page } from '@playwright/test'
import { expect, launchElectron, test, untilExit } from './fixtures'

const KEEP_OPEN = 2
const CLOSE_WITHOUT_SAVING = 1

// Windows refuses a rename over a read-only file. Other systems refuse a new file in a read-only folder.
function blockWrites(folder: string, file: string) {
  if (process.platform === 'win32') chmodSync(file, 0o444)
  else chmodSync(folder, 0o555)
  return () => {
    if (process.platform === 'win32') chmodSync(file, 0o644)
    else chmodSync(folder, 0o755)
  }
}

async function newDiagram(window: Page, folder: string) {
  await window.getByRole('button', { name: 'New diagram' }).click()
  await expect(window).toHaveURL(/#\/d\//)
  const id = decodeURIComponent(window.url().split('#/d/')[1] ?? '')
  const file = path.join(folder, `${id}.diagram.json`)
  await expect.poll(() => existsSync(file)).toBe(true)
  return file
}

async function rename(window: Page, name: string) {
  await window.getByLabel('Diagram name').fill(name)
  await window.getByLabel('Diagram name').press('Enter')
}

const savedName = (file: string) => JSON.parse(readFileSync(file, 'utf8')).name as string

async function answerCloseQuestions(app: ElectronApplication, response: number) {
  await app.evaluate(({ dialog }, answer) => {
    const asked = ((globalThis as { closeQuestions?: string[] }).closeQuestions ??= [])
    dialog.showMessageBox = async (...args: unknown[]) => {
      const options = args.at(-1) as { message: string }
      asked.push(options.message)
      return { response: answer, checkboxChecked: false }
    }
  }, response)
}

const closeQuestions = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as { closeQuestions?: string[] }).closeQuestions ?? [])

test('shows a save that fails, asks before the editor closes, and saves after the folder works again', async ({
  window,
  dirs,
}) => {
  const file = await newDiagram(window, dirs.data)
  const unblock = blockWrites(dirs.data, file)
  try {
    await rename(window, 'Changed while the folder is read-only')
    await expect(window.getByRole('button', { name: 'Not saved' })).toBeVisible()

    await window.getByRole('link', { name: 'All diagrams' }).click()
    const question = window.getByRole('dialog', { name: 'Leave without saving?' })
    await expect(question).toBeVisible()
    await question.getByRole('button', { name: 'Stay' }).click()
    await expect(question).toBeHidden()
    await expect(window).toHaveURL(/#\/d\//)
  } finally {
    unblock()
  }

  await window.getByRole('button', { name: 'Not saved' }).click()
  await window.getByRole('button', { name: 'Try again' }).click()
  await expect(window.getByRole('button', { name: 'Not saved' })).toBeHidden()
  expect(savedName(file)).toBe('Changed while the folder is read-only')

  await window.getByRole('link', { name: 'All diagrams' }).click()
  await expect(window.getByText('Changed while the folder is read-only')).toBeVisible()
})

test('asks before the window closes or the app quits while the diagram is not saved', async ({ appEnv, dirs }) => {
  const app = await launchElectron({ args: ['.'], env: appEnv })
  const window = await app.firstWindow()
  const file = await newDiagram(window, dirs.data)
  const unblock = blockWrites(dirs.data, file)
  try {
    await rename(window, 'Not in the file')
    await expect(window.getByRole('button', { name: 'Not saved' })).toBeVisible()

    await answerCloseQuestions(app, KEEP_OPEN)
    await (await app.browserWindow(window)).evaluate((browserWindow) => browserWindow.close())
    await expect.poll(() => closeQuestions(app)).toEqual(['“Not in the file” is not saved'])
    await expect(window.getByRole('button', { name: 'Not saved' })).toBeVisible()

    await answerCloseQuestions(app, CLOSE_WITHOUT_SAVING)
    const exit = untilExit(app)
    await window.keyboard.press('Control+k')
    await window.getByPlaceholder('Search for an action').fill('quit')
    await window.getByRole('option', { name: 'Quit Diagrams' }).click()
    await exit
    expect(savedName(file)).not.toBe('Not in the file')
  } finally {
    unblock()
  }
})
