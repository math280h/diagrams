import type { Theme } from './schema'
import { themeCss } from './stylesheet'

const STYLE_ID = 'dg-themes'
const rules = new Map<string, string>()

/** Adds the CSS rules of themes to the page, or replaces the rules of a theme that changed. */
export function addThemeStyles(themes: readonly Theme[]) {
  let changed = false
  for (const theme of themes) {
    const css = themeCss(theme)
    if (rules.get(theme.id) === css) continue
    rules.set(theme.id, css)
    changed = true
  }
  if (!changed || typeof document === 'undefined') return
  let element = document.getElementById(STYLE_ID)
  if (!element) {
    element = document.createElement('style')
    element.id = STYLE_ID
    document.head.append(element)
  }
  element.textContent = [...rules.values()].filter(Boolean).join('\n')
}
