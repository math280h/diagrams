import { describe, expect, it } from 'vitest'
import { builtInTheme } from '@/themes/built-in'
import { longHexColor, windowColorsOf } from './chrome'

const APP_COLORS: Record<string, string> = {
  '--panel': '#0f2a4e',
  '--foreground': '#f2f6fc',
  '--background': '#0b2342',
}

describe('windowColorsOf', () => {
  it('takes the window colours of the theme, and the header colours for the buttons that it leaves out', () => {
    const blueprint = builtInTheme('blueprint')!
    expect(windowColorsOf(blueprint, 'dark', (name) => APP_COLORS[name]!)).toEqual({
      controls: '#0f2a4e',
      symbols: '#f2f6fc',
      background: '#0b2342',
      border: '#ffd84a',
      scheme: 'dark',
    })
    expect(windowColorsOf(builtInTheme('light')!, 'system', (name) => APP_COLORS[name]!)).toMatchObject({
      border: null,
      scheme: 'system',
    })
  })

  it('drops the alpha of a colour, and gives no colours when a colour is not a hex colour', () => {
    const dark = builtInTheme('dark')!
    expect(windowColorsOf(dark, 'dark', (name) => `${APP_COLORS[name]!}cc`)?.background).toBe('#0b2342')
    expect(windowColorsOf(dark, 'dark', () => 'oklch(1 0 0)')).toBeNull()
  })
})

describe('longHexColor', () => {
  it('writes a short hex colour in full, so that the window buttons get the light theme too', () => {
    expect(longHexColor('#fff')).toBe('#ffffff')
    expect(longHexColor('#0aF')).toBe('#00aaFF')
  })

  it('keeps a long hex colour and other colours as they are', () => {
    expect(longHexColor('#0a0a0a')).toBe('#0a0a0a')
    expect(longHexColor('oklch(1 0 0)')).toBe('oklch(1 0 0)')
    expect(longHexColor('')).toBe('')
  })
})
