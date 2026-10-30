import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type AppTheme = 'dark' | 'light' | 'system'

/** The contrast of the canvas on screen. `system` follows the "more contrast" setting of the system. */
export type CanvasContrast = 'system' | 'standard' | 'high'

interface SettingsState {
  theme: AppTheme
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
  contrast: CanvasContrast
  setTheme: (theme: AppTheme) => void
  setAmbientMotion: (value: boolean) => void
  setInspectorOpen: (value: boolean) => void
  setSidePanelWidth: (value: number) => void
  setFlowPanelHeight: (value: number | null) => void
  setEmbedDiagram: (value: boolean) => void
  setShowMinimap: (value: boolean) => void
  setContrast: (value: CanvasContrast) => void
}

export const DEFAULT_SIDE_PANEL_WIDTH = 288

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      ambientMotion: true,
      inspectorOpen: true,
      sidePanelWidth: DEFAULT_SIDE_PANEL_WIDTH,
      flowPanelHeight: null,
      embedDiagram: false,
      showMinimap: true,
      contrast: 'system',
      setTheme: (theme) => set({ theme }),
      setAmbientMotion: (ambientMotion) => set({ ambientMotion }),
      setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
      setSidePanelWidth: (sidePanelWidth) => set({ sidePanelWidth }),
      setFlowPanelHeight: (flowPanelHeight) => set({ flowPanelHeight }),
      setEmbedDiagram: (embedDiagram) => set({ embedDiagram }),
      setShowMinimap: (showMinimap) => set({ showMinimap }),
      setContrast: (contrast) => set({ contrast }),
    }),
    {
      name: 'dg:settings',
      storage: createJSONStorage(() => localStorage),
      partialize: ({
        theme,
        ambientMotion,
        inspectorOpen,
        sidePanelWidth,
        flowPanelHeight,
        embedDiagram,
        showMinimap,
        contrast,
      }) => ({
        theme,
        ambientMotion,
        inspectorOpen,
        sidePanelWidth,
        flowPanelHeight,
        embedDiagram,
        showMinimap,
        contrast,
      }),
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

const MORE_CONTRAST = '(prefers-contrast: more)'

function systemPrefersMoreContrast() {
  return typeof window !== 'undefined' && window.matchMedia(MORE_CONTRAST).matches
}

function subscribeToSystemContrast(onChange: () => void) {
  const query = window.matchMedia(MORE_CONTRAST)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Returns true if canvases on screen use high contrast, and follows the system setting while it changes. */
export function useHighContrast(): boolean {
  const contrast = useSettings((state) => state.contrast)
  const systemMore = useSyncExternalStore(subscribeToSystemContrast, systemPrefersMoreContrast, () => false)
  return contrast === 'high' || (contrast === 'system' && systemMore)
}

/** Returns the app theme, and follows the system setting while it changes when the theme is `system`. */
export function useResolvedAppTheme(): 'dark' | 'light' {
  const theme = useSettings((state) => state.theme)
  const systemDark = useSyncExternalStore(subscribeToSystemScheme, systemPrefersDark, () => true)
  if (theme === 'system') return systemDark ? 'dark' : 'light'
  return theme
}
