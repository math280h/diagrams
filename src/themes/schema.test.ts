import { describe, expect, it } from 'vitest'
import { z } from '@/lib/zod'
import { BUILT_IN_THEMES } from './built-in'
import { parseThemeText, themeFileSchema } from './schema'
import { BUILT_IN_THEME_IDS } from './tokens'

describe('theme files', () => {
  it('reads a theme that gives some colours, and gives the others no value', () => {
    const parsed = parseThemeText(
      'custom:brand',
      JSON.stringify({
        $schema: 'https://draw.thias.dev/theme.schema.json',
        name: 'Brand',
        base: 'dark',
        app: { flow: '#ff7a00' },
        canvas: { ground: '#101010', 'hue-fill': 14, 'dim-art': 0.6 },
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
        canvas: { ground: '#101010', 'hue-fill': 14, 'dim-art': 0.6 },
        window: { border: '#ff7a00' },
      },
    })
  })

  it('names the keys that the format does not know, and keeps the rest of the theme', () => {
    const parsed = parseThemeText(
      'custom:typo',
      JSON.stringify({ name: 'Typo', base: 'light', colour: 1, canvas: { grund: '#ffffff', ground: '#fafafa' } }),
    )
    expect(parsed).toMatchObject({
      ok: true,
      unknown: ['colour', 'canvas.grund'],
      theme: { canvas: { ground: '#fafafa' } },
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
})
