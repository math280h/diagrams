import type { Color } from '@/model/colors'
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

/** Returns the CSS colour of a palette swatch. It needs an element with the `dg-zones` class and a theme around it. */
export function swatchColor(color: Color): string {
  return color === 'neutral' ? 'var(--dg-line-strong)' : `var(--dg-zone-${color})`
}
