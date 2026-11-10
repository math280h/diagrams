import { describe, expect, it } from 'vitest'
import { quitHint, stillRunningNotice } from './keep-running'

describe('quitHint', () => {
  it('names the way to quit on each platform', () => {
    expect(quitHint('darwin')).toBe('To quit, press Command-Q.')
    expect(quitHint('win32')).toContain('notification area')
    expect(quitHint('linux')).toContain('system tray')
    expect(quitHint('linux')).toContain('turn this off and close the window')
  })
})

describe('stillRunningNotice', () => {
  it('says that agents can still connect, and where the tray icon is', () => {
    expect(stillRunningNotice('win32')).toEqual({
      title: 'Diagrams is still running',
      body: 'Agents can still connect. To quit, right-click the Diagrams icon in the notification area.',
    })
    expect(stillRunningNotice('linux').body).toBe(
      'Agents can still connect. To quit, use the Diagrams icon in the system tray.',
    )
  })
})
