import type { ThemeMode } from '@/store/settings-store'
import type { Theme } from './schema'
import { themeCss } from './stylesheet'
import type { ThemeBase } from './tokens'

/** The key of the themes that `public/theme-boot.js` shows before the app script runs. */
export const BOOT_THEME_KEY = 'dg:theme-boot'

interface BootTheme {
  id: string
  base: ThemeBase
  css: string
}

/** The content of {@link BOOT_THEME_KEY}. `public/theme-boot.js` reads it, so a change needs a change there too. */
export interface BootThemes {
  mode: ThemeMode
  light: BootTheme
  dark: BootTheme
}

function bootTheme(theme: Theme): BootTheme {
  return { id: theme.id, base: theme.base, css: themeCss(theme) }
}

/**
 * Keeps the themes for the next start of the app, so that its first frame has the colours of the theme.
 *
 * @returns False if the browser does not keep them, for example because its storage is full.
 */
export function saveBootThemes(mode: ThemeMode, themes: Record<ThemeBase, Theme>): boolean {
  const value: BootThemes = { mode, light: bootTheme(themes.light), dark: bootTheme(themes.dark) }
  try {
    localStorage.setItem(BOOT_THEME_KEY, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** Gives the page the app colours of a theme. */
export function applyAppTheme(theme: Theme) {
  const root = document.documentElement
  root.dataset.appTheme = theme.id
  root.dataset.appBase = theme.base
  root.classList.toggle('dark', theme.base === 'dark')
  root.style.colorScheme = theme.base
  const background = getComputedStyle(root).getPropertyValue('--background').trim()
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = background
}
