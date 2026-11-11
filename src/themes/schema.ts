import { z } from '@/lib/zod'
import {
  APP_COLORS,
  CANVAS_COLORS,
  CANVAS_OPACITIES,
  CANVAS_PERCENTS,
  THEME_BASES,
  WINDOW_COLORS,
  type AppColor,
  type CanvasToken,
  type ThemeBase,
  type WindowColor,
} from './tokens'

const COLOR_PATTERN = /^#[\da-fA-F]{6}([\da-fA-F]{2})?$/
const OPAQUE_COLOR_PATTERN = /^#[\da-fA-F]{6}$/

const color = z.string().regex(COLOR_PATTERN, 'Use a colour in the form #rrggbb or #rrggbbaa.')
const opaqueColor = z.string().regex(OPAQUE_COLOR_PATTERN, 'Use a colour in the form #rrggbb.')
const percent = z.number().min(0).max(100)
const opacity = z.number().min(0).max(1)

function optionalFields<K extends string, T extends z.ZodType>(keys: readonly K[], value: T) {
  return Object.fromEntries(keys.map((key) => [key, value.optional()])) as Record<K, z.ZodOptional<T>>
}

const appSchema = z.object(optionalFields(APP_COLORS, color))
const canvasSchema = z.object({
  ...optionalFields(CANVAS_COLORS, color),
  ...optionalFields(CANVAS_PERCENTS, percent),
  ...optionalFields(CANVAS_OPACITIES, opacity),
})
const windowSchema = z.object(optionalFields(WINDOW_COLORS, opaqueColor))

/** The content of a `.theme.json` file. A colour that a theme leaves out comes from its base. */
export const themeFileSchema = z
  .object({
    $schema: z.string().optional(),
    name: z.string().trim().min(1).max(60).describe('The name of the theme in the theme menus.'),
    base: z
      .enum(THEME_BASES)
      .describe('The built-in theme that gives each colour that this theme leaves out. It also sets light or dark.'),
    contrast: z
      .enum(['standard', 'high'])
      .optional()
      .describe(
        'high for a theme with 7:1 for text and 4.5:1 for lines. The app can use it when the system asks for more contrast.',
      ),
    app: appSchema.optional().describe('The colours of the app around the canvas. Each is the CSS variable --<name>.'),
    canvas: canvasSchema
      .optional()
      .describe(
        'The colours of the canvas. Each is the CSS variable --dg-<name>. hue-fill and hue-line are percents, the dim values are opacities from 0 to 1.',
      ),
    window: windowSchema
      .optional()
      .describe(
        'The colours of the desktop window: controls and symbols for the window buttons on Windows and Linux, border for the active window border on Windows.',
      ),
  })
  .describe('A colour theme of Diagrams.')
export type ThemeFile = z.infer<typeof themeFileSchema>

export type ThemeContrast = 'standard' | 'high'

export interface Theme {
  /** A built-in name such as `graphite`, or `custom:` and the file name for a theme of the user. */
  id: string
  name: string
  base: ThemeBase
  contrast: ThemeContrast
  app: Partial<Record<AppColor, string>>
  canvas: Partial<Record<CanvasToken, string | number>>
  window: Partial<Record<WindowColor, string>>
}

export function themeOfFile(id: string, file: ThemeFile): Theme {
  return {
    id,
    name: file.name,
    base: file.base,
    contrast: file.contrast ?? 'standard',
    app: file.app ?? {},
    canvas: file.canvas ?? {},
    window: file.window ?? {},
  }
}

const KNOWN_KEYS: Record<string, ReadonlySet<string>> = {
  '': new Set(Object.keys(themeFileSchema.shape)),
  app: new Set(APP_COLORS),
  canvas: new Set(Object.keys(canvasSchema.shape)),
  window: new Set(WINDOW_COLORS),
}

function unknownKeys(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  const found = Object.keys(record).filter((key) => !KNOWN_KEYS['']!.has(key))
  for (const group of ['app', 'canvas', 'window']) {
    const inner = record[group]
    if (typeof inner !== 'object' || inner === null) continue
    for (const key of Object.keys(inner)) if (!KNOWN_KEYS[group]!.has(key)) found.push(`${group}.${key}`)
  }
  return found
}

const MAX_ISSUES = 3

export type ParsedTheme = { ok: true; theme: Theme; unknown: string[] } | { ok: false; problem: string }

/**
 * Reads the text of a theme file.
 *
 * @returns The theme and the keys that the format does not know, or the first problems of the file.
 */
export function parseThemeText(id: string, text: string): ParsedTheme {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    return { ok: false, problem: `The file is not JSON: ${error instanceof Error ? error.message : String(error)}` }
  }
  const result = themeFileSchema.safeParse(value)
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, MAX_ISSUES)
      .map((issue) => (issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    return { ok: false, problem: issues.join(' ') }
  }
  return { ok: true, theme: themeOfFile(id, result.data), unknown: unknownKeys(value) }
}
