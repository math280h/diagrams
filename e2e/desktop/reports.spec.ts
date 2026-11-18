import { homedir } from 'node:os'
import { crashDumps, expect, launchApp, test, untilExit } from './fixtures'

const CRASH_WAIT_MS = 30_000

test('keeps a crash of the app with its dump, and tells about it at the next start', async ({ appEnv, dirs }) => {
  test.setTimeout(120_000)
  const first = await launchApp(appEnv)
  const exited = untilExit(first.app)
  await first.app.evaluate(() => setTimeout(() => process.crash(), 100)).catch(() => undefined)
  await exited
  await expect.poll(() => crashDumps(dirs.userData).length, { timeout: CRASH_WAIT_MS }).toBe(1)

  const { app, window } = await launchApp(appEnv)
  try {
    const notice = window.locator('[data-sonner-toast]').filter({ hasText: 'The app stopped unexpectedly' })
    await expect(notice).toBeVisible({ timeout: 15_000 })
    await notice.getByRole('button', { name: 'More details' }).click()

    const dialog = window.getByRole('dialog', { name: 'Report this crash' })
    const text = dialog.getByLabel('Report text')
    await expect(text).toContainText('"process": "main"')
    await expect(text).toContainText('"surface": "desktop"')
    await expect(text).not.toContainText(dirs.userData)
    await expect(text).not.toContainText(homedir())
    const dumpSwitch = dialog.getByRole('switch', { name: /^Add the crash dump/ })
    await expect(dumpSwitch).not.toBeChecked()
    await expect(dialog).toContainText('It can contain diagram text')
    await expect(dialog.getByRole('button', { name: 'Show the file' })).toBeVisible()
    await expect(dialog).toContainText('This build sends no reports.')
    await window.keyboard.press('Escape')

    await window.getByRole('button', { name: 'App settings' }).click()
    await window.getByRole('dialog', { name: 'App settings' }).getByRole('button', { name: 'Problem reports' }).click()
    const list = window.getByRole('dialog', { name: 'Problem reports' })
    const appCrash = list
      .getByRole('list', { name: 'Crashes' })
      .getByRole('listitem')
      .filter({ hasText: 'The app stopped' })
    await expect(appCrash).toContainText(/Crash dump of \d/)
    await appCrash.getByRole('button', { name: /^Delete the crash of/ }).click()
    await expect(appCrash).toHaveCount(0)
    expect(crashDumps(dirs.userData)).toEqual([])
  } finally {
    await app.close()
  }
})
