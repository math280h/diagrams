import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  addWebsite,
  APP_SETTINGS_FILE,
  createAppSettings,
  publicSettings,
  removeWebsite,
  setShareWebsite,
  type StoredSettings,
} from './app-settings'

const OFFICIAL = 'https://draw.thias.dev'
const COMPANY = 'https://diagrams.example.com'
const folders: string[] = []

function settingsFile() {
  const folder = mkdtempSync(path.join(tmpdir(), 'app-settings-'))
  folders.push(folder)
  return path.join(folder, 'user-data', APP_SETTINGS_FILE)
}

function stored(change: Partial<StoredSettings> = {}): StoredSettings {
  return {
    keepRunning: true,
    backgroundNoticeShown: false,
    openAtLoginAdded: false,
    agentWindow: 'show',
    websites: [OFFICIAL],
    shareWebsite: OFFICIAL,
    addedBuildWebsites: [OFFICIAL],
    updateRepository: null,
    ...change,
  }
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

describe('createAppSettings', () => {
  it('keeps the app running and trusts the website of the build by default', () => {
    expect(createAppSettings(settingsFile(), OFFICIAL).get()).toEqual(stored())
  })

  it('writes a change and reads it at the next start', () => {
    const file = settingsFile()
    createAppSettings(file, OFFICIAL).update({ keepRunning: false })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(stored({ keepRunning: false }))
    expect(createAppSettings(file, OFFICIAL).get().keepRunning).toBe(false)
  })

  it('uses the default for a damaged file or a value of the wrong type', () => {
    const file = settingsFile()
    createAppSettings(file, OFFICIAL).update({ backgroundNoticeShown: true })
    writeFileSync(
      file,
      JSON.stringify({
        keepRunning: 'no',
        backgroundNoticeShown: true,
        websites: ['http://example.com', 7, COMPANY, `${COMPANY}/#/d/1`],
        shareWebsite: 'ftp://example.com',
        addedBuildWebsites: [OFFICIAL],
        updateRepository: 'not a repository',
      }),
    )
    expect(createAppSettings(file, OFFICIAL).get()).toEqual(
      stored({ backgroundNoticeShown: true, websites: [COMPANY], shareWebsite: null }),
    )
    writeFileSync(file, '{ not json')
    expect(createAppSettings(file, OFFICIAL).get()).toEqual(stored())
  })

  it('adds the website of another build once, for share links too, and keeps a removed one away', () => {
    const file = settingsFile()
    createAppSettings(file, OFFICIAL)
    const company = createAppSettings(file, COMPANY)
    expect(company.get()).toEqual(
      stored({ websites: [OFFICIAL, COMPANY], shareWebsite: COMPANY, addedBuildWebsites: [OFFICIAL, COMPANY] }),
    )
    company.update((current) => removeWebsite(current, COMPANY))
    expect(createAppSettings(file, COMPANY).get().websites).toEqual([OFFICIAL])
    expect(createAppSettings(file, OFFICIAL).get().websites).toEqual([OFFICIAL])
  })

  it('trusts only the website of the build at the first start of a build of another website', () => {
    expect(createAppSettings(settingsFile(), COMPANY).get()).toEqual(
      stored({ websites: [COMPANY], shareWebsite: COMPANY, addedBuildWebsites: [COMPANY] }),
    )
  })

  it('keeps a change for this run when the file cannot be written', () => {
    const file = settingsFile()
    const blocked = path.join(path.dirname(path.dirname(file)), 'blocked')
    writeFileSync(blocked, 'a file where a folder should be')
    const settings = createAppSettings(path.join(blocked, APP_SETTINGS_FILE), OFFICIAL)
    expect(settings.update({ keepRunning: false }).keepRunning).toBe(false)
    expect(settings.get().keepRunning).toBe(false)
  })

  it('gives the renderer only the settings that it shows, with a website for share links', () => {
    const settings = stored({ keepRunning: false, backgroundNoticeShown: true, openAtLoginAdded: true })
    expect(publicSettings({ ...settings, agentWindow: 'hidden' }, 'on')).toEqual({
      keepRunning: false,
      openAtLogin: 'on',
      agentWindow: 'hidden',
      websites: [OFFICIAL],
      shareWebsite: OFFICIAL,
    })
    expect(publicSettings(stored({ websites: [COMPANY], shareWebsite: OFFICIAL }), 'off').shareWebsite).toBe(COMPANY)
  })

  it('reads the agent window mode and the one-time sign-in entry, and uses the default for other values', () => {
    const file = settingsFile()
    createAppSettings(file, OFFICIAL).update({ openAtLoginAdded: true, agentWindow: 'focus' })
    expect(createAppSettings(file, OFFICIAL).get()).toMatchObject({ openAtLoginAdded: true, agentWindow: 'focus' })
    writeFileSync(file, JSON.stringify({ ...stored(), openAtLoginAdded: 'yes', agentWindow: 'minimized' }))
    expect(createAppSettings(file, OFFICIAL).get()).toMatchObject({ openAtLoginAdded: false, agentWindow: 'show' })
  })
})

describe('website changes', () => {
  it('adds the origin of an address and refuses one that the app does not accept', () => {
    expect(addWebsite(stored(), 'diagrams.example.com/#/d/abc').websites).toEqual([OFFICIAL, COMPANY])
    expect(addWebsite(stored(), 'http://localhost:8080').websites).toEqual([OFFICIAL, 'http://localhost:8080'])
    expect(() => addWebsite(stored(), 'http://diagrams.example.com')).toThrow('starts with https://')
    expect(() => addWebsite(stored(), 'https://user:secret@diagrams.example.com')).toThrow('starts with https://')
    expect(() => addWebsite(stored(), `${OFFICIAL}/`)).toThrow('is in the list already')
  })

  it('removes a website, gives share links to the first website, and keeps the last website', () => {
    const settings = stored({ websites: [OFFICIAL, COMPANY], shareWebsite: COMPANY })
    const removed = removeWebsite(settings, COMPANY)
    expect(removed.websites).toEqual([OFFICIAL])
    expect(publicSettings(removed, 'off').shareWebsite).toBe(OFFICIAL)
    expect(() => removeWebsite(removed, OFFICIAL)).toThrow('at least one website')
  })

  it('opens share links only on a website in the list', () => {
    const settings = stored({ websites: [OFFICIAL, COMPANY] })
    expect(setShareWebsite(settings, COMPANY).shareWebsite).toBe(COMPANY)
    expect(() => setShareWebsite(settings, 'https://other.example')).toThrow('is not in the list')
  })
})
