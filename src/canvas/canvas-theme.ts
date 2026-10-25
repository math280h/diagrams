import type { DiagramTheme } from '@/model/schema'
import { resolveAppTheme, useResolvedAppTheme, useSettings } from '@/store/settings-store'

export type CanvasTheme = 'dark' | 'light'

/** Returns the theme of a canvas for a diagram theme mode. The mode `auto` follows the app theme. */
export function canvasTheme(mode: DiagramTheme['mode'], appTheme: CanvasTheme): CanvasTheme {
  return mode === 'auto' ? appTheme : mode
}

export function currentCanvasTheme(mode: DiagramTheme['mode']): CanvasTheme {
  return canvasTheme(mode, resolveAppTheme(useSettings.getState().theme))
}

export function useCanvasTheme(mode: DiagramTheme['mode']): CanvasTheme {
  return canvasTheme(mode, useResolvedAppTheme())
}
