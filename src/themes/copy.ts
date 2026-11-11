import { BUILD } from '@/desktop/build-config'
import type { Theme, ThemeFile } from './schema'
import { addThemeStyles } from './styles'
import { APP_COLORS, CANVAS_COLORS, CANVAS_OPACITIES, CANVAS_PERCENTS, type AppColor, type CanvasToken } from './tokens'

/** The address of the JSON Schema of theme files, for the completion of text editors. */
export const THEME_SCHEMA_URL = `${BUILD.website}/theme.schema.json`

const SHORT_HEX = /^#([\da-f])([\da-f])([\da-f])([\da-f])?$/i
const HEX = /^#[\da-f]{6}([\da-f]{2})?$/i
const MAX_SLUG_CHARS = 56

function longHex(value: string): string {
  const short = SHORT_HEX.exec(value)
  if (!short) return value.toLowerCase()
  return `#${short
    .slice(1)
    .flatMap((digit) => (digit ? [digit, digit] : []))
    .join('')}`.toLowerCase()
}

/**
 * Returns a theme file with every colour of a theme, also the colours that it takes from its base, so that a person
 * can start a theme of their own from it.
 */
export function fullThemeFile(theme: Theme, name: string): ThemeFile {
  addThemeStyles([theme])
  const canvasProbe = Object.assign(document.createElement('div'), { className: 'dg-canvas', hidden: true })
  canvasProbe.dataset.base = theme.base
  canvasProbe.dataset.theme = theme.id
  const appProbe = Object.assign(document.createElement('div'), { hidden: true })
  appProbe.dataset.appBase = theme.base
  appProbe.dataset.appTheme = theme.id
  document.body.append(canvasProbe, appProbe)
  try {
    const appStyle = getComputedStyle(appProbe)
    const canvasStyle = getComputedStyle(canvasProbe)
    const app: Partial<Record<AppColor, string>> = {}
    for (const token of APP_COLORS) {
      const value = longHex(appStyle.getPropertyValue(`--${token}`).trim())
      if (HEX.test(value)) app[token] = value
    }
    const canvas: Partial<Record<CanvasToken, string | number>> = {}
    for (const token of CANVAS_COLORS) {
      const value = longHex(canvasStyle.getPropertyValue(`--dg-${token}`).trim())
      if (HEX.test(value)) canvas[token] = value
    }
    for (const token of CANVAS_PERCENTS) {
      const value = Number.parseFloat(canvasStyle.getPropertyValue(`--dg-${token}`))
      if (Number.isFinite(value)) canvas[token] = value
    }
    for (const token of CANVAS_OPACITIES) {
      const value = theme.canvas[token]
      if (value !== undefined) canvas[token] = value
    }
    return {
      $schema: THEME_SCHEMA_URL,
      name,
      base: theme.base,
      ...(theme.contrast === 'high' ? { contrast: 'high' as const } : {}),
      app,
      canvas: canvas as ThemeFile['canvas'],
      ...(Object.keys(theme.window).length > 0 ? { window: theme.window } : {}),
    }
  } finally {
    canvasProbe.remove()
    appProbe.remove()
  }
}

export function themeFileText(file: ThemeFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}

/** Returns a file name for a theme name that no theme file in `taken` has, without the suffix. */
export function themeFileName(name: string, taken: ReadonlySet<string>): string {
  const slug =
    name
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z\d]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_SLUG_CHARS)
      .replace(/-+$/, '') || 'theme'
  let candidate = slug
  for (let number = 2; taken.has(candidate); number++) candidate = `${slug}-${number}`
  return candidate
}
