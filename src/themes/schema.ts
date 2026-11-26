import { z } from '@/lib/zod'
import {
  APP_COLORS,
  CANVAS_COLORS,
  CANVAS_OPACITIES,
  CANVAS_PERCENTS,
  THEME_BASES,
  THEME_KEY_ALIASES,
  WINDOW_COLORS,
  type AppColor,
  type CanvasToken,
  type ThemeBase,
  type ThemeKeyGroup,
  type WindowColor,
} from './tokens'

const COLOR_PATTERN = /^#[\da-fA-F]{6}([\da-fA-F]{2})?$/
const OPAQUE_COLOR_PATTERN = /^#[\da-fA-F]{6}$/

const color = z.string().regex(COLOR_PATTERN, 'Use a colour in the form #rrggbb or #rrggbbaa.')
const opaqueColor = z.string().regex(OPAQUE_COLOR_PATTERN, 'Use a colour in the form #rrggbb.')
const percent = z.number().min(0).max(100)
const opacity = z.number().min(0).max(1)

function valuesOf<K extends string, T extends z.ZodType>(keys: readonly K[], value: T) {
  return Object.fromEntries(keys.map((key) => [key, value])) as Record<K, T>
}

function withCurrentKeys<K extends string, V>(
  values: Readonly<Record<string, V | undefined>>,
  aliases: Readonly<Record<string, K>>,
): Partial<Record<K, V>> {
  const current: Partial<Record<K, V>> = {}
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && !Object.hasOwn(aliases, key)) current[key as K] = value
  }
  for (const [alias, key] of Object.entries(aliases)) {
    const value = values[alias]
    if (value !== undefined && current[key] === undefined) current[key] = value
  }
  return current
}

function groupSchema<K extends string, V>(
  values: Readonly<Record<K, z.ZodType<V>>>,
  aliases: Readonly<Record<string, K>>,
) {
  const fields: Record<string, z.ZodOptional<z.ZodType<V>>> = {}
  for (const [key, value] of Object.entries<z.ZodType<V>>(values)) fields[key] = value.optional()
  for (const [alias, key] of Object.entries(aliases)) {
    fields[alias] = values[key].optional().meta({ deprecated: true, description: `The earlier name of ${key}.` })
  }
  return z.object(fields).transform((group) => withCurrentKeys(group, aliases))
}

const appSchema = groupSchema<AppColor, string>(valuesOf(APP_COLORS, color), THEME_KEY_ALIASES.app)
const canvasSchema = groupSchema<CanvasToken, string | number>(
  { ...valuesOf(CANVAS_COLORS, color), ...valuesOf(CANVAS_PERCENTS, percent), ...valuesOf(CANVAS_OPACITIES, opacity) },
  THEME_KEY_ALIASES.canvas,
)
const windowSchema = groupSchema<WindowColor, string>(valuesOf(WINDOW_COLORS, opaqueColor), THEME_KEY_ALIASES.window)

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
    app: appSchema.optional().describe('The colours of the app around the canvas.'),
    canvas: canvasSchema
      .optional()
      .describe(
        'The colours of the canvas. hue-fill and hue-line are percents, the dim values are opacities from 0 to 1.',
      ),
    window: windowSchema
      .optional()
      .describe(
        'The colours of the desktop window: button-background and button-symbols for the window buttons on Windows and Linux, border for the active window border on Windows.',
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

const FILE_KEYS: ReadonlySet<string> = new Set(Object.keys(themeFileSchema.shape))
const GROUP_KEYS: Readonly<Record<ThemeKeyGroup, ReadonlySet<string>>> = {
  app: new Set([...APP_COLORS, ...Object.keys(THEME_KEY_ALIASES.app)]),
  canvas: new Set([
    ...CANVAS_COLORS,
    ...CANVAS_PERCENTS,
    ...CANVAS_OPACITIES,
    ...Object.keys(THEME_KEY_ALIASES.canvas),
  ]),
  window: new Set([...WINDOW_COLORS, ...Object.keys(THEME_KEY_ALIASES.window)]),
}

function unknownKeys(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  const found = Object.keys(record).filter((key) => !FILE_KEYS.has(key))
  for (const [group, known] of Object.entries(GROUP_KEYS)) {
    const inner = record[group]
    if (typeof inner !== 'object' || inner === null) continue
    for (const key of Object.keys(inner)) if (!known.has(key)) found.push(`${group}.${key}`)
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
