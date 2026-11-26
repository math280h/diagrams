import { describe, expect, it } from 'vitest'
import { builtInTheme } from './built-in'
import { fullThemeFile, themeFileText } from './copy'
import sample022 from './samples/v0.2.2.theme.json'
import { parseThemeText, themeFileSchema } from './schema'
import { APP_COLORS, CANVAS_COLORS, CANVAS_PERCENTS, THEME_KEY_ALIASES } from './tokens'
import '@/index.css'
import '@/styles/canvas.css'

describe('fullThemeFile', () => {
  it('writes every colour of a theme, also the colours that come from its base', () => {
    const file = fullThemeFile(builtInTheme('light')!, 'Light copy')
    expect(Object.keys(file.app!).toSorted()).toEqual([...APP_COLORS].toSorted())
    expect(Object.keys(file.canvas!).toSorted()).toEqual([...CANVAS_COLORS, ...CANVAS_PERCENTS].toSorted())
    expect(file.app!.background).toBe('#ffffff')
    expect(file.canvas!['grid-line']).toBe('#0000000f')
    expect(file.canvas!['hue-fill']).toBe(8)
    expect(themeFileSchema.parse(JSON.parse(themeFileText(file)))).toEqual(file)
  })

  it('keeps the colours, the contrast and the window colours of the theme', () => {
    const graphite = fullThemeFile(builtInTheme('graphite')!, 'Graphite copy')
    expect(graphite).toMatchObject({ name: 'Graphite copy', base: 'dark', window: { border: '#5b93ff' } })
    expect(graphite.canvas!.background).toBe('#1b1c1f')
    expect(graphite).not.toHaveProperty('contrast')
    const high = fullThemeFile(builtInTheme('dark-high-contrast')!, 'High copy')
    expect(high).toMatchObject({ contrast: 'high', canvas: { 'dim-flow-icons': 0.7, text: '#ffffff' } })
  })

  it('writes the current keys for a theme file with earlier keys, with the same colours', () => {
    const parsed = parseThemeText('custom:old-copy', JSON.stringify(sample022))
    if (!parsed.ok) throw new Error(parsed.problem)
    const copy = fullThemeFile(parsed.theme, 'Old copy')
    const written = JSON.parse(themeFileText(copy)) as Record<'app' | 'canvas' | 'window', Record<string, unknown>>
    for (const group of ['app', 'canvas', 'window'] as const) {
      const aliases: Readonly<Record<string, string>> = THEME_KEY_ALIASES[group]
      expect(Object.keys(written[group]).filter((key) => Object.hasOwn(aliases, key))).toEqual([])
      for (const [name, value] of Object.entries(sample022[group])) {
        expect(written[group][aliases[name] ?? name], `${group}.${name}`).toBe(value)
      }
    }
  })
})
