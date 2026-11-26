import type { Theme } from './schema'
import { APP_COLOR_VARIABLES, CANVAS_PERCENTS, CANVAS_TOKEN_VARIABLES } from './tokens'

const SAFE_ID = /^[\w:-]+$/
const SAFE_COLOR = /^#[\da-f]{6}([\da-f]{2})?$/i
const PERCENTS: ReadonlySet<string> = new Set(CANVAS_PERCENTS)

function safeValue(value: string | number): boolean {
  return typeof value === 'number' ? Number.isFinite(value) : SAFE_COLOR.test(value)
}

function declarations(
  values: Readonly<Partial<Record<string, string | number>>>,
  variables: Readonly<Record<string, string>>,
) {
  return Object.entries(values)
    .flatMap(([key, value]) => {
      const variable = Object.hasOwn(variables, key) ? variables[key] : undefined
      if (!variable || value === undefined || !safeValue(value)) return []
      return [`${variable}:${typeof value === 'number' && PERCENTS.has(key) ? `${value}%` : value}`]
    })
    .join(';')
}

/**
 * Returns the CSS rules of a theme. The app colours apply to an element with `data-app-base` and `data-app-theme`, and
 * the canvas colours to a canvas with `data-base` and `data-theme`. A colour that the theme leaves out comes from the
 * base rules in `src/index.css` and `src/styles/canvas.css`.
 */
export function themeCss(theme: Theme): string {
  if (!SAFE_ID.test(theme.id)) return ''
  const rules: string[] = []
  const app = declarations(theme.app, APP_COLOR_VARIABLES)
  if (app) rules.push(`[data-app-base][data-app-theme="${theme.id}"]{${app}}`)
  const canvas = declarations(theme.canvas, CANVAS_TOKEN_VARIABLES)
  if (canvas) rules.push(`:is(.dg-canvas,.dg-zones)[data-base][data-theme="${theme.id}"]{${canvas}}`)
  return rules.join('\n')
}
