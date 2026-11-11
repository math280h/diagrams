import { create } from 'zustand'
import type { ThemeSource } from '@/desktop/contract'
import { BUILT_IN_THEMES, builtInTheme, defaultTheme } from './built-in'
import { parseThemeText, type Theme } from './schema'
import { addThemeStyles } from './styles'
import { CUSTOM_THEME_PREFIX, THEME_NAME_PATTERN, type ThemeBase } from './tokens'

export type { ThemeSource }

export interface CustomThemeFile {
  name: string
  theme: Theme | null
  /** Why the app cannot use the file, or `null`. */
  problem: string | null
  /** The keys of the file that the theme format does not know. */
  unknown: string[]
}

/**
 * Where the themes of the user come from. `desktop` and `folder` read the `themes` folder of the diagrams folder.
 * `browser` keeps imported themes in this browser.
 */
export type ThemePlace = 'desktop' | 'folder' | 'browser'

interface ThemeState {
  place: ThemePlace
  files: CustomThemeFile[]
}

export const useThemeStore = create<ThemeState>(() => ({ place: 'browser', files: [] }))

addThemeStyles(BUILT_IN_THEMES)

export function customThemeId(name: string): string {
  return `${CUSTOM_THEME_PREFIX}${name}`
}

function readFile({ name, text }: ThemeSource): CustomThemeFile {
  if (!THEME_NAME_PATTERN.test(name)) {
    return {
      name,
      theme: null,
      problem: 'Use only small letters, digits and dashes in the file name.',
      unknown: [],
    }
  }
  const parsed = parseThemeText(customThemeId(name), text)
  return parsed.ok
    ? { name, theme: parsed.theme, problem: null, unknown: parsed.unknown }
    : { name, theme: null, problem: parsed.problem, unknown: [] }
}

/** Replaces the themes of the user with the themes in these files. */
export function setThemeFiles(place: ThemePlace, sources: readonly ThemeSource[]) {
  const files = sources.map(readFile).toSorted((a, b) => a.name.localeCompare(b.name))
  addThemeStyles(files.flatMap((file) => (file.theme ? [file.theme] : [])))
  useThemeStore.setState({ place, files })
}

export function customThemes(files: readonly CustomThemeFile[]): Theme[] {
  return files.flatMap((file) => (file.theme ? [file.theme] : []))
}

export function allThemes(files: readonly CustomThemeFile[] = useThemeStore.getState().files): Theme[] {
  return [...BUILT_IN_THEMES, ...customThemes(files)]
}

export function findTheme(id: string, files: readonly CustomThemeFile[] = useThemeStore.getState().files) {
  return builtInTheme(id) ?? customThemes(files).find((theme) => theme.id === id)
}

/** Returns the theme with this id, or the default theme of the base when the app has no such theme. */
export function themeOrDefault(id: string | null, base: ThemeBase, files?: readonly CustomThemeFile[]): Theme {
  return (id === null ? undefined : findTheme(id, files)) ?? defaultTheme(base)
}
