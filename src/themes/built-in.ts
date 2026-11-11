import blueprint from './built-in/blueprint.theme.json' with { type: 'json' }
import circuit from './built-in/circuit.theme.json' with { type: 'json' }
import darkHighContrast from './built-in/dark-high-contrast.theme.json' with { type: 'json' }
import dark from './built-in/dark.theme.json' with { type: 'json' }
import dusk from './built-in/dusk.theme.json' with { type: 'json' }
import fog from './built-in/fog.theme.json' with { type: 'json' }
import graphPaper from './built-in/graph-paper.theme.json' with { type: 'json' }
import graphite from './built-in/graphite.theme.json' with { type: 'json' }
import lightHighContrast from './built-in/light-high-contrast.theme.json' with { type: 'json' }
import light from './built-in/light.theme.json' with { type: 'json' }
import { themeFileSchema, themeOfFile, type Theme } from './schema'
import { BUILT_IN_THEME_IDS, type BuiltInThemeId, type ThemeBase } from './tokens'

const FILES: Record<BuiltInThemeId, unknown> = {
  light,
  dark,
  'light-high-contrast': lightHighContrast,
  'dark-high-contrast': darkHighContrast,
  graphite,
  blueprint,
  circuit,
  dusk,
  'graph-paper': graphPaper,
  fog,
}

export const BUILT_IN_THEMES: readonly Theme[] = BUILT_IN_THEME_IDS.map((id) =>
  themeOfFile(id, themeFileSchema.parse(FILES[id])),
)

/** The themes that the app uses until the user picks others. */
export const DEFAULT_THEME_IDS: Readonly<Record<ThemeBase, string>> = { light: 'light', dark: 'dark' }

/** The themes that the app uses while the system asks for more contrast, until the user picks others. */
export const HIGH_CONTRAST_THEME_IDS: Readonly<Record<ThemeBase, string>> = {
  light: 'light-high-contrast',
  dark: 'dark-high-contrast',
}

export function builtInTheme(id: string): Theme | undefined {
  return BUILT_IN_THEMES.find((theme) => theme.id === id)
}

export function defaultTheme(base: ThemeBase): Theme {
  return builtInTheme(DEFAULT_THEME_IDS[base])!
}
