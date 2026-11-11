import { useMemo } from 'react'
import {
  systemPrefersDark,
  systemPrefersMoreContrast,
  useSettings,
  useSystemDark,
  useSystemMoreContrast,
  type ThemeChoice,
} from '@/store/settings-store'
import type { Theme } from './schema'
import { themeOrDefault, useThemeStore, type CustomThemeFile } from './store'
import type { ThemeBase } from './tokens'

/** The state of the system that the theme choice depends on. */
export interface SystemLook {
  dark: boolean
  moreContrast: boolean
}

/** Returns the base that the app shows for a theme mode. */
export function activeBase(choice: Pick<ThemeChoice, 'themeMode'>, system: SystemLook): ThemeBase {
  if (choice.themeMode !== 'system') return choice.themeMode
  return system.dark ? 'dark' : 'light'
}

/** Returns the theme that the app shows for a base: the contrast theme while the system asks for more contrast. */
export function themeForBase(
  base: ThemeBase,
  choice: ThemeChoice,
  system: SystemLook,
  files?: readonly CustomThemeFile[],
): Theme {
  const contrastId = system.moreContrast ? choice.contrastThemes[base] : null
  return themeOrDefault(contrastId ?? choice.themes[base], base, files)
}

function currentSystem(): SystemLook {
  return { dark: systemPrefersDark(), moreContrast: systemPrefersMoreContrast() }
}

/** Returns the theme that the app shows now. Use {@link useActiveTheme} in components. */
export function activeTheme(): Theme {
  const choice = useSettings.getState()
  const system = currentSystem()
  return themeForBase(activeBase(choice, system), choice, system)
}

/** Makes a theme the theme of its base, and changes the mode when the app shows the other base now. */
export function showTheme(theme: Theme) {
  const settings = useSettings.getState()
  settings.setTheme(theme.base, theme.id)
  if (activeBase(settings, currentSystem()) !== theme.base) settings.setThemeMode(theme.base)
}

/** Returns the theme that the app shows for a base now. */
export function currentThemeForBase(base: ThemeBase): Theme {
  return themeForBase(base, useSettings.getState(), currentSystem())
}

function useChoice(): { choice: ThemeChoice; system: SystemLook; files: CustomThemeFile[] } {
  const themeMode = useSettings((state) => state.themeMode)
  const themes = useSettings((state) => state.themes)
  const contrastThemes = useSettings((state) => state.contrastThemes)
  const dark = useSystemDark()
  const moreContrast = useSystemMoreContrast()
  const files = useThemeStore((state) => state.files)
  return { choice: { themeMode, themes, contrastThemes }, system: { dark, moreContrast }, files }
}

/** Returns the theme that the app shows, and follows the settings, the system and the theme files. */
export function useActiveTheme(): Theme {
  const { choice, system, files } = useChoice()
  return themeForBase(activeBase(choice, system), choice, system, files)
}

/** Returns the theme that the app shows for each base, as the exports of a dark and a light image need. */
export function useThemesByBase(): Record<ThemeBase, Theme> {
  const { choice, system, files } = useChoice()
  const light = themeForBase('light', choice, system, files)
  const dark = themeForBase('dark', choice, system, files)
  return useMemo(() => ({ light, dark }), [light, dark])
}
