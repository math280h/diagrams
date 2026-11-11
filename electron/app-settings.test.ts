import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { APP_SETTINGS_FILE, createAppSettings, publicSettings } from './app-settings'

const folders: string[] = []

function settingsFile() {
  const folder = mkdtempSync(path.join(tmpdir(), 'app-settings-'))
  folders.push(folder)
  return path.join(folder, 'user-data', APP_SETTINGS_FILE)
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

describe('createAppSettings', () => {
  it('keeps the app running after the window closes by default', () => {
    expect(createAppSettings(settingsFile()).get()).toEqual({ keepRunning: true, backgroundNoticeShown: false })
  })

  it('writes a change and reads it at the next start', () => {
    const file = settingsFile()
    createAppSettings(file).update({ keepRunning: false })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ keepRunning: false, backgroundNoticeShown: false })
    expect(createAppSettings(file).get().keepRunning).toBe(false)
  })

  it('uses the default for a damaged file or a value of the wrong type', () => {
    const file = settingsFile()
    createAppSettings(file).update({ backgroundNoticeShown: true })
    writeFileSync(file, JSON.stringify({ keepRunning: 'no', backgroundNoticeShown: true }))
    expect(createAppSettings(file).get()).toEqual({ keepRunning: true, backgroundNoticeShown: true })
    writeFileSync(file, '{ not json')
    expect(createAppSettings(file).get()).toEqual({ keepRunning: true, backgroundNoticeShown: false })
  })

  it('keeps a change for this run when the file cannot be written', () => {
    const file = settingsFile()
    const blocked = path.join(path.dirname(path.dirname(file)), 'blocked')
    writeFileSync(blocked, 'a file where a folder should be')
    const settings = createAppSettings(path.join(blocked, APP_SETTINGS_FILE))
    expect(settings.update({ keepRunning: false }).keepRunning).toBe(false)
    expect(settings.get().keepRunning).toBe(false)
  })

  it('gives the renderer only the settings that it shows', () => {
    expect(publicSettings({ keepRunning: false, backgroundNoticeShown: true })).toEqual({ keepRunning: false })
  })
})
