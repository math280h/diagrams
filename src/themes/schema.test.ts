import { describe, expect, it } from 'vitest'
import { z } from '@/lib/zod'
import { BUILT_IN_THEMES } from './built-in'
import sample022 from './samples/v0.2.2.theme.json'
import { parseThemeText, themeFileSchema } from './schema'
import { themeCss } from './stylesheet'
import { BUILT_IN_THEME_IDS, THEME_KEY_ALIASES, THEME_KEY_GROUPS } from './tokens'

describe('theme files', () => {
  it('reads a theme that gives some colours, and gives the others no value', () => {
    const parsed = parseThemeText(
      'custom:brand',
      JSON.stringify({
        $schema: 'https://draw.thias.dev/theme.schema.json',
        name: 'Brand',
        base: 'dark',
        app: { flow: '#ff7a00' },
        canvas: { background: '#101010', 'hue-fill': 14, 'dim-flow-icons': 0.6 },
        window: { border: '#ff7a00' },
      }),
    )
    expect(parsed).toEqual({
      ok: true,
      unknown: [],
      theme: {
        id: 'custom:brand',
        name: 'Brand',
        base: 'dark',
        contrast: 'standard',
        app: { flow: '#ff7a00' },
        canvas: { background: '#101010', 'hue-fill': 14, 'dim-flow-icons': 0.6 },
        window: { border: '#ff7a00' },
      },
    })
  })

  it('reads a file with the keys of 0.2.2 in the colours of 0.2.2, and knows each key', () => {
    const parsed = parseThemeText('custom:old', JSON.stringify(sample022))
    if (!parsed.ok) throw new Error(parsed.problem)
    expect(parsed.unknown).toEqual([])
    const declarations = (css: string) => [...css.matchAll(/\{([^}]*)\}/g)].flatMap((rule) => rule[1]!.split(';'))
    const percent = (key: string) => (key.startsWith('hue-') ? '%' : '')
    const before = [
      ...Object.entries(sample022.app).map(([key, value]) => `--${key}:${value}`),
      ...Object.entries(sample022.canvas).map(([key, value]) => `--dg-${key}:${value}${percent(key)}`),
    ]
    expect(declarations(themeCss(parsed.theme)).toSorted()).toEqual(before.toSorted())
    expect(parsed.theme.window).toEqual({
      'button-background': sample022.window.controls,
      'button-symbols': sample022.window.symbols,
      border: sample022.window.border,
    })
  })

  it('takes the current key when a file has a key and its earlier name', () => {
    for (const canvas of [
      { ground: '#111111', background: '#222222' },
      { background: '#222222', ground: '#111111' },
    ]) {
      expect(parseThemeText('custom:both', JSON.stringify({ name: 'Both', base: 'dark', canvas }))).toMatchObject({
        ok: true,
        unknown: [],
        theme: { canvas: { background: '#222222' } },
      })
    }
  })

  it('names the earlier key of the file when its value is not valid', () => {
    const parsed = parseThemeText(
      'custom:bad',
      JSON.stringify({ name: 'Bad', base: 'dark', canvas: { ground: 'red' } }),
    )
    expect(parsed.ok ? '' : parsed.problem).toContain('canvas.ground: Use a colour in the form #rrggbb')
  })

  it('names the keys that the format does not know, and keeps the rest of the theme', () => {
    const parsed = parseThemeText(
      'custom:typo',
      JSON.stringify({ name: 'Typo', base: 'light', colour: 1, canvas: { grund: '#ffffff', background: '#fafafa' } }),
    )
    expect(parsed).toMatchObject({
      ok: true,
      unknown: ['colour', 'canvas.grund'],
      theme: { canvas: { background: '#fafafa' } },
    })
  })

  it.each([
    ['{ "name": ', 'The file is not JSON'],
    [JSON.stringify({ name: 'No base' }), 'base:'],
    [
      JSON.stringify({ name: 'Bad', base: 'dark', app: { panel: 'red' } }),
      'app.panel: Use a colour in the form #rrggbb',
    ],
    [JSON.stringify({ name: 'Bad', base: 'dark', window: { border: '#ff000080' } }), 'window.border'],
    [JSON.stringify({ name: 'Bad', base: 'dark', canvas: { 'dim-art': 2 } }), 'canvas.dim-art'],
    [JSON.stringify({ name: '', base: 'dark' }), 'name:'],
  ])('explains why it cannot use %s', (text, problem) => {
    const parsed = parseThemeText('custom:bad', text)
    expect(parsed.ok).toBe(false)
    expect(parsed.ok ? '' : parsed.problem).toContain(problem)
  })

  it('has a built-in theme for each built-in id, in the order of the ids', () => {
    expect(BUILT_IN_THEMES.map((theme) => theme.id)).toEqual(BUILT_IN_THEME_IDS)
    expect(BUILT_IN_THEMES.filter((theme) => theme.contrast === 'high').map((theme) => theme.id)).toEqual([
      'light-high-contrast',
      'dark-high-contrast',
    ])
  })

  it('publishes the JSON Schema of the theme format for text editors', async () => {
    await expect(`${JSON.stringify(z.toJSONSchema(themeFileSchema, { io: 'input' }), null, 2)}\n`).toMatchFileSnapshot(
      '../../public/theme.schema.json',
    )
  })

  it('marks the earlier names of keys as deprecated in the JSON Schema, so that editors accept old files', () => {
    const schema = z.toJSONSchema(themeFileSchema, { io: 'input' }) as {
      properties: Record<string, { properties: Record<string, { deprecated?: boolean; description?: string }> }>
    }
    for (const group of THEME_KEY_GROUPS) {
      const properties = schema.properties[group]!.properties
      for (const [name, key] of Object.entries(THEME_KEY_ALIASES[group])) {
        expect(properties[name]).toMatchObject({ deprecated: true, description: `The earlier name of ${key}.` })
        expect(properties[key]).not.toHaveProperty('deprecated')
      }
    }
  })
})
