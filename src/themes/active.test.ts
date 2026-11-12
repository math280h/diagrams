import { describe, expect, it } from 'vitest'
import type { ThemeChoice } from '@/store/settings-store'
import { activeBase, themeForBase } from './active'
import { themeOfFile } from './schema'
import type { CustomThemeFile } from './store'

const choice: ThemeChoice = {
  themeMode: 'system',
  themes: { light: 'fog', dark: 'custom:brand' },
  contrastThemes: { light: 'light-high-contrast', dark: null },
}

const brand = themeOfFile('custom:brand', { name: 'Brand', base: 'dark' })
const files: CustomThemeFile[] = [{ name: 'brand', theme: brand, problem: null, unknown: [] }]

describe('the theme that the app shows', () => {
  it('follows the system in the system mode, and keeps the base of an explicit mode', () => {
    expect(activeBase(choice, { dark: true, moreContrast: false })).toBe('dark')
    expect(activeBase(choice, { dark: false, moreContrast: false })).toBe('light')
    expect(activeBase({ themeMode: 'light' }, { dark: true, moreContrast: false })).toBe('light')
  })

  it('takes the theme of the base, and the contrast theme while the system asks for more contrast', () => {
    expect(themeForBase('light', choice, { dark: false, moreContrast: false }).id).toBe('fog')
    expect(themeForBase('light', choice, { dark: false, moreContrast: true }).id).toBe('light-high-contrast')
    expect(themeForBase('dark', choice, { dark: true, moreContrast: true }, files)).toBe(brand)
  })

  it('takes the default theme of the base when the theme file is gone', () => {
    expect(themeForBase('dark', choice, { dark: true, moreContrast: false }, []).id).toBe('dark')
  })
})
