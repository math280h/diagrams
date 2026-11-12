import { useInsertionEffect } from 'react'
import type { Color } from '@/model/colors'
import type { Theme } from '@/themes/schema'
import { addThemeStyles } from '@/themes/styles'

/** Returns the CSS colour of a palette swatch. It needs an element with the `dg-zones` class and a theme around it. */
export function swatchColor(color: Color): string {
  return color === 'neutral' ? 'var(--dg-line-strong)' : `var(--dg-zone-${color})`
}

/** Returns the attributes that give an element with the `dg-canvas` or `dg-zones` class the colours of a theme. */
export function canvasThemeAttributes(theme: Theme) {
  return { 'data-theme': theme.id, 'data-base': theme.base }
}

/** Adds the CSS rules of a theme to the page before the theme shows, for a theme that comes from outside the app. */
export function useThemeStyles(theme: Theme) {
  useInsertionEffect(() => addThemeStyles([theme]), [theme])
}
