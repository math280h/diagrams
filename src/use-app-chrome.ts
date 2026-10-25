import { useEffect } from 'react'
import { syncTitleBarColors, useDesktopChrome } from '@/desktop/chrome'
import { useResolvedAppTheme } from '@/store/settings-store'

/**
 * Applies the app theme to the document and adapts the page to the desktop window.
 *
 * @returns The resolved app theme.
 */
export function useAppChrome() {
  const theme = useResolvedAppTheme()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
    syncTitleBarColors()
  }, [theme])

  useDesktopChrome()
  return theme
}
