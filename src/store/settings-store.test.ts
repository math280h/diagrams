import { describe, expect, it } from 'vitest'
import { migrateSettings } from './settings-store'

describe('settings of earlier versions', () => {
  it('keeps the light or dark choice and the other settings, and follows the system contrast as before', () => {
    expect(migrateSettings({ theme: 'dark', contrast: 'system', showMinimap: false }, 0)).toEqual({
      themeMode: 'dark',
      themes: { light: 'light', dark: 'dark' },
      contrastThemes: { light: 'light-high-contrast', dark: 'dark-high-contrast' },
      showMinimap: false,
    })
  })

  it('turns high contrast into the high contrast themes, and standard contrast into no contrast themes', () => {
    expect(migrateSettings({ theme: 'system', contrast: 'high' }, 0)).toMatchObject({
      themeMode: 'system',
      themes: { light: 'light-high-contrast', dark: 'dark-high-contrast' },
    })
    expect(migrateSettings({ contrast: 'standard' }, 0)).toMatchObject({
      themeMode: 'system',
      contrastThemes: { light: null, dark: null },
    })
  })

  it('keeps settings of the current version as they are', () => {
    const current = { themeMode: 'light', themes: { light: 'fog', dark: 'dusk' } }
    expect(migrateSettings(current, 1)).toBe(current)
    expect(migrateSettings(null, 0)).toEqual({})
  })
})
