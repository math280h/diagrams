import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { DEFAULT_THEME_IDS, HIGH_CONTRAST_THEME_IDS } from '@/themes/built-in'
import type { ThemeBase } from '@/themes/tokens'

/** Which theme the app shows: the one for the system setting, or always the light or the dark one. */
export type ThemeMode = 'system' | 'light' | 'dark'

export interface ThemeChoice {
  themeMode: ThemeMode
  /** The id of the theme for each base. */
  themes: Record<ThemeBase, string>
  /** The id of the theme for each base while the system asks for more contrast. `null` keeps the theme of the base. */
  contrastThemes: Record<ThemeBase, string | null>
}

interface SettingsState extends ThemeChoice {
  ambientMotion: boolean
  inspectorOpen: boolean
  /** The width of the panels at the sides of the editor canvas, in pixels. */
  sidePanelWidth: number
  /** The height of the flow panel in pixels. `null` takes the height of its view. */
  flowPanelHeight: number | null
  /** If true, an exported image holds the diagram, so that Diagrams can open it again. */
  embedDiagram: boolean
  /** If true, a large diagram shows a minimap in the editor. */
  showMinimap: boolean
  setThemeMode: (mode: ThemeMode) => void
  setTheme: (base: ThemeBase, id: string) => void
  setContrastTheme: (base: ThemeBase, id: string | null) => void
  setAmbientMotion: (value: boolean) => void
  setInspectorOpen: (value: boolean) => void
  setSidePanelWidth: (value: number) => void
  setFlowPanelHeight: (value: number | null) => void
  setEmbedDiagram: (value: boolean) => void
  setShowMinimap: (value: boolean) => void
}

export const DEFAULT_SIDE_PANEL_WIDTH = 288

const SETTINGS_VERSION = 1

type PersistedSettings = Omit<SettingsState, `set${string}`>

/** The settings before version 1: one app theme, and the contrast of the canvas on screen. */
interface SettingsV0 {
  theme?: ThemeMode
  contrast?: 'system' | 'standard' | 'high'
}

/** Moves the settings of an earlier version to the current one. */
export function migrateSettings(persisted: unknown, version: number): Partial<PersistedSettings> {
  if (typeof persisted !== 'object' || persisted === null) return {}
  if (version >= SETTINGS_VERSION) return persisted
  const { theme, contrast, ...rest } = persisted as SettingsV0 & Partial<PersistedSettings>
  return {
    ...rest,
    themeMode: theme === 'light' || theme === 'dark' ? theme : 'system',
    themes: contrast === 'high' ? { ...HIGH_CONTRAST_THEME_IDS } : { ...DEFAULT_THEME_IDS },
    contrastThemes: contrast === 'standard' ? { light: null, dark: null } : { ...HIGH_CONTRAST_THEME_IDS },
  }
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      themes: { ...DEFAULT_THEME_IDS },
      contrastThemes: { ...HIGH_CONTRAST_THEME_IDS },
      ambientMotion: true,
      inspectorOpen: true,
      sidePanelWidth: DEFAULT_SIDE_PANEL_WIDTH,
      flowPanelHeight: null,
      embedDiagram: false,
      showMinimap: true,
      setThemeMode: (themeMode) => set({ themeMode }),
      setTheme: (base, id) => set((state) => ({ themes: { ...state.themes, [base]: id } })),
      setContrastTheme: (base, id) => set((state) => ({ contrastThemes: { ...state.contrastThemes, [base]: id } })),
      setAmbientMotion: (ambientMotion) => set({ ambientMotion }),
      setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
      setSidePanelWidth: (sidePanelWidth) => set({ sidePanelWidth }),
      setFlowPanelHeight: (flowPanelHeight) => set({ flowPanelHeight }),
      setEmbedDiagram: (embedDiagram) => set({ embedDiagram }),
      setShowMinimap: (showMinimap) => set({ showMinimap }),
    }),
    {
      name: 'dg:settings',
      version: SETTINGS_VERSION,
      migrate: migrateSettings,
      storage: createJSONStorage(() => localStorage),
      partialize: ({
        themeMode,
        themes,
        contrastThemes,
        ambientMotion,
        inspectorOpen,
        sidePanelWidth,
        flowPanelHeight,
        embedDiagram,
        showMinimap,
      }): PersistedSettings => ({
        themeMode,
        themes,
        contrastThemes,
        ambientMotion,
        inspectorOpen,
        sidePanelWidth,
        flowPanelHeight,
        embedDiagram,
        showMinimap,
      }),
    },
  ),
)

const DARK_SCHEME = '(prefers-color-scheme: dark)'
const MORE_CONTRAST = '(prefers-contrast: more)'

function mediaMatches(query: string): boolean {
  return typeof window !== 'undefined' && window.matchMedia(query).matches
}

function subscribeToMedia(query: string) {
  return (onChange: () => void) => {
    const list = window.matchMedia(query)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }
}

const subscribeToScheme = subscribeToMedia(DARK_SCHEME)
const subscribeToContrast = subscribeToMedia(MORE_CONTRAST)

export function systemPrefersDark(): boolean {
  return mediaMatches(DARK_SCHEME)
}

export function systemPrefersMoreContrast(): boolean {
  return mediaMatches(MORE_CONTRAST)
}

/** Returns true while the system uses a dark colour scheme, and follows it while it changes. */
export function useSystemDark(): boolean {
  return useSyncExternalStore(subscribeToScheme, systemPrefersDark, () => true)
}

/** Returns true while the system asks for more contrast, and follows it while it changes. */
export function useSystemMoreContrast(): boolean {
  return useSyncExternalStore(subscribeToContrast, systemPrefersMoreContrast, () => false)
}
