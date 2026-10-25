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
      theme: 'dark',
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

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveAppTheme(theme: AppTheme): 'dark' | 'light' {
  if (theme === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return theme
}

export function useResolvedAppTheme(): 'dark' | 'light' {
  return resolveAppTheme(useSettings((state) => state.theme))
}
