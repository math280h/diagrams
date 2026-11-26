import { describe, expect, it } from 'vitest'
import released from './released-keys.json'
import { parseThemeText } from './schema'
import {
  APP_COLORS,
  CANVAS_COLORS,
  CANVAS_OPACITIES,
  CANVAS_PERCENTS,
  THEME_KEY_ALIASES,
  THEME_KEY_GROUPS,
  WINDOW_COLORS,
  type ThemeKeyGroup,
} from './tokens'

const RELEASED: Readonly<Record<ThemeKeyGroup, readonly string[]>> = released
const ALIASES: Readonly<Record<ThemeKeyGroup, Readonly<Record<string, string>>>> = THEME_KEY_ALIASES
const KEYS: Readonly<Record<ThemeKeyGroup, readonly string[]>> = {
  app: APP_COLORS,
  canvas: [...CANVAS_COLORS, ...CANVAS_PERCENTS, ...CANVAS_OPACITIES],
  window: WINDOW_COLORS,
}
const PERCENTS: ReadonlySet<string> = new Set(CANVAS_PERCENTS)
const OPACITIES: ReadonlySet<string> = new Set(CANVAS_OPACITIES)
const HOW = 'See "Keep theme keys" in docs/RELEASING.md.'

function keyOf(group: ThemeKeyGroup, name: string): string {
  return Object.hasOwn(ALIASES[group], name) ? ALIASES[group][name]! : name
}

function valueOf(key: string): string | number {
  if (PERCENTS.has(key)) return 37
  if (OPACITIES.has(key)) return 0.37
  return '#123456'
}

function readsAs(group: ThemeKeyGroup, name: string): boolean {
  const key = keyOf(group, name)
  if (!KEYS[group].includes(key)) return false
  const value = valueOf(key)
  const parsed = parseThemeText(
    'custom:keys',
    JSON.stringify({ name: 'Keys', base: 'dark', [group]: { [name]: value } }),
  )
  if (!parsed.ok || parsed.unknown.length > 0) return false
  return (parsed.theme[group] as Record<string, unknown>)[key] === value
}

describe('theme keys of earlier releases', () => {
  it('are in the groups of a theme file', () => {
    expect(Object.keys(RELEASED)).toEqual(THEME_KEY_GROUPS)
  })

  it('all still read, directly or through an alias', () => {
    const lost = THEME_KEY_GROUPS.flatMap((group) =>
      RELEASED[group].filter((name) => !readsAs(group, name)).map((name) => `${group}.${name}`),
    )
    expect(lost, `These keys of earlier releases do not read now. ${HOW}`).toEqual([])
  })

  it('hold every key that the app reads', () => {
    const missing = THEME_KEY_GROUPS.flatMap((group) =>
      [...KEYS[group], ...Object.keys(ALIASES[group])]
        .filter((name) => !RELEASED[group].includes(name))
        .map((name) => `${group}.${name}`),
    )
    expect(missing, `Run node scripts/theme-keys.ts to add the new theme keys. ${HOW}`).toEqual([])
  })

  it('have an alias only when the name is no longer a key, and the alias names a key', () => {
    for (const group of THEME_KEY_GROUPS) {
      for (const [name, key] of Object.entries(ALIASES[group])) {
        expect(RELEASED[group], `${group}.${name} is not a key of an earlier release`).toContain(name)
        expect(KEYS[group], `${group}.${name} is a key, so it needs no alias`).not.toContain(name)
        expect(KEYS[group], `the alias of ${group}.${name} names no key`).toContain(key)
      }
    }
  })
})
