import { useEffect } from 'react'
import { syncWindowColors, useDesktopChrome } from '@/desktop/chrome'
import { useSettings } from '@/store/settings-store'
import { useActiveTheme, useThemesByBase } from '@/themes/active'
import { applyAppTheme, saveBootThemes } from '@/themes/apply'
import type { Theme } from '@/themes/schema'

/**
 * Applies the app theme to the document and adapts the page to the desktop window.
 *
 * @returns The theme that the app shows.
 */
export function useAppChrome(): Theme {
  const theme = useActiveTheme()
  const byBase = useThemesByBase()
  const themeMode = useSettings((state) => state.themeMode)

  useEffect(() => {
    applyAppTheme(theme)
    syncWindowColors(theme, themeMode)
  }, [theme, themeMode])

  useEffect(() => {
    saveBootThemes(themeMode, byBase)
  }, [themeMode, byBase])

  useDesktopChrome()
  return theme
}
