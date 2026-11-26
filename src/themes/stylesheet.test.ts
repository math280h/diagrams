import { describe, expect, it } from 'vitest'
import { builtInTheme } from './built-in'
import { themeOfFile, type Theme } from './schema'
import { themeCss } from './stylesheet'

describe('themeCss', () => {
  it('writes the app colours and the canvas colours of a theme as variables', () => {
    const theme = themeOfFile('custom:brand', {
      name: 'Brand',
      base: 'dark',
      app: { flow: '#ff7a00' },
      canvas: { background: '#101010', 'hue-fill': 14, 'dim-flow-icons': 0.6 },
    })
    expect(themeCss(theme)).toBe(
      [
        '[data-app-base][data-app-theme="custom:brand"]{--flow:#ff7a00}',
        ':is(.dg-canvas,.dg-zones)[data-base][data-theme="custom:brand"]{--dg-ground:#101010;--dg-hue-fill:14%;--dg-dim-art:0.6}',
      ].join('\n'),
    )
  })

  it('writes no rules for a theme that only names its base', () => {
    expect(themeCss(builtInTheme('dark')!)).toBe('')
  })

  it('leaves out values and ids that could change other CSS', () => {
    const theme = themeOfFile('custom:x', { name: 'X', base: 'light' })
    expect(themeCss({ ...theme, app: { flow: 'red;}body{display:none' } })).toBe('')
    expect(themeCss({ ...theme, canvas: { 'hue-fill': Number.NaN } })).toBe('')
    expect(themeCss({ ...theme, id: 'x"]{}', app: { flow: '#ffffff' } })).toBe('')
  })

  it('writes each key as its CSS variable, and leaves out keys that are not keys of a theme', () => {
    const theme = themeOfFile('custom:x', { name: 'X', base: 'light' })
    expect(themeCss({ ...theme, app: { text: '#111111', 'focus-ring': '#222222' } })).toBe(
      '[data-app-base][data-app-theme="custom:x"]{--foreground:#111111;--focus:#222222}',
    )
    expect(themeCss({ ...theme, canvas: { node: '#333333', 'protocol-token-text': '#444444' } })).toBe(
      ':is(.dg-canvas,.dg-zones)[data-base][data-theme="custom:x"]{--dg-panel:#333333;--dg-wire-ink:#444444}',
    )
    expect(themeCss({ ...theme, app: { constructor: '#ffffff', foreground: '#ffffff' } as Theme['app'] })).toBe('')
  })
})
