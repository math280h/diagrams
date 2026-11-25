import { describe, expect, it } from 'vitest'
import type { TrayHost } from './contract'
import {
  keepRunningHint,
  quitButtonHint,
  quitHint,
  showsStartedNotice,
  showsStillRunningNotice,
  startedNotice,
  stillRunningNotice,
  trayIconShows,
} from './keep-running'

const HOSTS: TrayHost[] = ['present', 'missing', 'unknown']

describe('trayIconShows', () => {
  it('trusts the tray on Windows and macOS, and on Linux only with a tray host', () => {
    for (const host of HOSTS) {
      expect(trayIconShows('win32', host)).toBe(true)
      expect(trayIconShows('darwin', host)).toBe(true)
    }
    expect(trayIconShows('linux', 'present')).toBe(true)
    expect(trayIconShows('linux', 'missing')).toBe(false)
    expect(trayIconShows('linux', 'unknown')).toBe(false)
  })
})

describe('quitHint', () => {
  it('names the way to quit on each platform', () => {
    expect(quitHint('darwin', 'present')).toBe('To quit, use the Diagrams icon in the menu bar.')
    expect(quitHint('win32', 'present')).toContain('notification area')
    expect(quitHint('linux', 'present')).toBe('To quit, use the Diagrams icon in the system tray.')
  })

  it('tells how the window comes back on a Linux desktop without a tray host', () => {
    expect(quitHint('linux', 'missing')).toBe(
      'This desktop shows no tray icon. To get the window back, start Diagrams again.',
    )
    expect(quitHint('linux', 'missing')).not.toContain('system tray')
  })

  it('names the tray and the way back without it when the app cannot ask the system', () => {
    expect(quitHint('linux', 'unknown')).toBe(
      'To quit, use the Diagrams icon in the system tray. If this desktop shows no tray, start Diagrams again to get the window back.',
    )
  })

  it('keeps the text of Windows and macOS for every answer', () => {
    for (const host of HOSTS) {
      expect(quitHint('win32', host)).toBe(quitHint('win32', 'present'))
      expect(quitHint('darwin', host)).toBe(quitHint('darwin', 'present'))
    }
  })
})

describe('keepRunningHint', () => {
  it('says that agents can connect, then how to quit', () => {
    expect(keepRunningHint('win32', 'present')).toBe(
      'Agents can connect while the window is closed. To quit, right-click the Diagrams icon in the notification area.',
    )
    expect(keepRunningHint('linux', 'missing')).toBe(
      `Agents can connect while the window is closed. ${quitHint('linux', 'missing')}`,
    )
  })
})

describe('quitButtonHint', () => {
  it('gives a quit button only when the tray icon can be missing', () => {
    expect(quitButtonHint('win32', 'missing')).toBeNull()
    expect(quitButtonHint('darwin', 'unknown')).toBeNull()
    expect(quitButtonHint('linux', 'present')).toBeNull()
    expect(quitButtonHint('linux', 'missing')).toBe('Stops the app and its agent server.')
    expect(quitButtonHint('linux', 'unknown')).toBe(
      'If this desktop shows no tray icon, quit here to stop the app and its agent server.',
    )
  })
})

describe('stillRunningNotice', () => {
  it('says that agents can still connect, and where the tray icon is', () => {
    expect(stillRunningNotice('win32', 'present')).toEqual({
      title: 'Diagrams is still running',
      body: 'Agents can still connect. To quit, right-click the Diagrams icon in the notification area.',
    })
    expect(stillRunningNotice('linux', 'present').body).toBe(
      'Agents can still connect. To quit, use the Diagrams icon in the system tray.',
    )
    expect(stillRunningNotice('darwin', 'present').body).toBe(
      'Agents can still connect. To quit, use the Diagrams icon in the menu bar.',
    )
  })

  it('tells how to open and quit the app without a tray icon', () => {
    for (const host of ['missing', 'unknown'] as const) {
      expect(stillRunningNotice('linux', host)).toEqual({
        title: 'Diagrams is still running',
        body: 'Agents can still connect. To open the window, click this notice or start Diagrams again. To quit, use Quit in the app settings.',
      })
    }
  })
})

describe('startedNotice', () => {
  it('tells after a start at sign-in that the app runs, and how to open and quit it', () => {
    expect(startedNotice()).toEqual({
      title: 'Diagrams is running',
      body: 'Agents can connect. To open the window, click this notice or start Diagrams. To quit, use Quit in the app settings.',
    })
  })

  it('shows only when the tray icon can be missing', () => {
    expect(showsStartedNotice('win32', 'present')).toBe(false)
    expect(showsStartedNotice('darwin', 'unknown')).toBe(false)
    expect(showsStartedNotice('linux', 'present')).toBe(false)
    expect(showsStartedNotice('linux', 'missing')).toBe(true)
    expect(showsStartedNotice('linux', 'unknown')).toBe(true)
  })
})

describe('showsStillRunningNotice', () => {
  it('shows the notice one time with a tray icon', () => {
    expect(showsStillRunningNotice('win32', 'present', false)).toBe(true)
    expect(showsStillRunningNotice('win32', 'present', true)).toBe(false)
    expect(showsStillRunningNotice('darwin', 'missing', true)).toBe(false)
    expect(showsStillRunningNotice('linux', 'present', true)).toBe(false)
  })

  it('shows the notice at each close on Linux without a tray host', () => {
    expect(showsStillRunningNotice('linux', 'missing', true)).toBe(true)
    expect(showsStillRunningNotice('linux', 'missing', false)).toBe(true)
    expect(showsStillRunningNotice('linux', 'unknown', true)).toBe(true)
  })
})
