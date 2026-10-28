import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type AppTheme = 'dark' | 'light' | 'system'

interface SettingsState {
  theme: AppTheme
  ambientMotion: boolean
  inspectorOpen: boolean
  setTheme: (theme: AppTheme) => void
  setAmbientMotion: (value: boolean) => void
  setInspectorOpen: (value: boolean) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      ambientMotion: true,
      inspectorOpen: true,
      setTheme: (theme) => set({ theme }),
      setAmbientMotion: (ambientMotion) => set({ ambientMotion }),
      setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
    }),
    {
      name: 'dg:settings',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ theme, ambientMotion, inspectorOpen }) => ({ theme, ambientMotion, inspectorOpen }),
    },
  ),
)

const DARK_SCHEME = '(prefers-color-scheme: dark)'

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia(DARK_SCHEME).matches
}

function subscribeToSystemScheme(onChange: () => void) {
  const query = window.matchMedia(DARK_SCHEME)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function resolveAppTheme(theme: AppTheme): 'dark' | 'light' {
  if (theme === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return theme
}

/** Returns the app theme, and follows the system setting while it changes when the theme is `system`. */
export function useResolvedAppTheme(): 'dark' | 'light' {
  const theme = useSettings((state) => state.theme)
  const systemDark = useSyncExternalStore(subscribeToSystemScheme, systemPrefersDark, () => true)
  if (theme === 'system') return systemDark ? 'dark' : 'light'
  return theme
}
