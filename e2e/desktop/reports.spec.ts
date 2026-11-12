import { readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { expect, launchApp, test, untilExit } from './fixtures'

const CRASH_WAIT_MS = 30_000

function dumpFiles(folder: string, depth = 0): string[] {
  if (depth > 3) return []
  let names: string[]
  try {
    names = readdirSync(folder)
  } catch {
    return []
  }
  return names.flatMap((name) => {
    const file = path.join(folder, name)
    if (statSync(file).isDirectory()) return name === 'new' ? [] : dumpFiles(file, depth + 1)
    return name.endsWith('.dmp') ? [file] : []
  })
}

test('keeps a crash of the app with its dump, and tells about it at the next start', async ({ appEnv, dirs }) => {
  test.setTimeout(120_000)
  const first = await launchApp(appEnv)
  const exited = untilExit(first.app)
  await first.app.evaluate(() => setTimeout(() => process.crash(), 100)).catch(() => undefined)
  await exited
  await expect.poll(() => dumpFiles(path.join(dirs.userData, 'Crashpad')).length, { timeout: CRASH_WAIT_MS }).toBe(1)

  const { app, window } = await launchApp(appEnv)
  try {
    const notice = window.getByText('The app stopped unexpectedly')
    await expect(notice).toBeVisible({ timeout: 15_000 })
    await window.getByRole('button', { name: 'More details' }).click()

    const dialog = window.getByRole('dialog', { name: 'Report this crash' })
    const text = dialog.getByLabel('Report text')
    await expect(text).toContainText('"process": "main"')
    await expect(text).toContainText('"surface": "desktop"')
    await expect(text).not.toContainText(dirs.userData)
    await expect(text).not.toContainText(homedir())
    const dumpSwitch = dialog.getByRole('switch', { name: /^Add the crash dump/ })
    await expect(dumpSwitch).not.toBeChecked()
    await expect(dialog).toContainText('It can hold text from your diagrams')
    await expect(dialog.getByRole('button', { name: 'Show the file' })).toBeVisible()
    await expect(dialog).toContainText('This build sends no reports.')
    await window.keyboard.press('Escape')

    await window.getByRole('button', { name: 'Problem reports' }).click()
    const list = window.getByRole('dialog', { name: 'Problem reports' })
    const crashes = list.getByRole('list', { name: 'Crashes' })
    await expect(crashes).toContainText('The app stopped')
    await expect(crashes).toContainText(/Crash dump of \d/)
    await crashes.getByRole('button', { name: /^Delete the crash of/ }).click()
    await expect(list.getByText('No crashes.')).toBeVisible()
    expect(dumpFiles(path.join(dirs.userData, 'Crashpad'))).toEqual([])
  } finally {
    await app.close()
  }
})
