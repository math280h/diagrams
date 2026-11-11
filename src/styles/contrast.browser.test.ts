import { describe, expect, it } from 'vitest'
import { BUILT_IN_THEMES } from '@/themes/built-in'
import { checkThemeContrast } from '@/themes/contrast'
import { themeOfFile } from '@/themes/schema'
import '@/index.css'
import './canvas.css'

describe('the built-in themes', () => {
  it.each(BUILT_IN_THEMES.map((theme) => [theme.name, theme] as const))(
    '%s meets the contrast of its colour pairs',
    (_name, theme) => {
      expect(checkThemeContrast(theme).map((failure) => `${failure.name}: ${failure.ratio.toFixed(2)}`)).toEqual([])
    },
  )
})

describe('the contrast check of a theme file', () => {
  it('finds the pairs below their contrast', () => {
    const grey = themeOfFile('custom:grey', {
      name: 'Grey',
      base: 'dark',
      canvas: { ground: '#2a2a2a', muted: '#555555' },
      app: { 'muted-foreground': '#3a3a3a' },
    })
    const names = checkThemeContrast(grey).map((failure) => failure.name)
    expect(names).toContain('--dg-muted on --dg-ground')
    expect(names).toContain('--muted-foreground on --background')
    expect(names).not.toContain('--dg-text on --dg-ground')
  })

  it('needs more contrast from a theme with high contrast', () => {
    const dark = BUILT_IN_THEMES.find((theme) => theme.id === 'dark')!
    expect(checkThemeContrast(dark)).toEqual([])
    expect(checkThemeContrast({ ...dark, id: 'custom:dark-high', contrast: 'high' }).length).toBeGreaterThan(0)
  })
})
