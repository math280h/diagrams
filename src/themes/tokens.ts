/** The colours of the app around the canvas. Each is the CSS variable `--<name>` in `src/index.css`. */
export const APP_COLORS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-hover',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'faint',
  'accent',
  'accent-foreground',
  'destructive',
  'border',
  'input',
  'focus',
  'panel',
  'panel-border',
  'raised',
  'flow',
  'flow-ink',
  'ok',
  'info',
  'warn',
] as const
export type AppColor = (typeof APP_COLORS)[number]

/** The colours of the canvas. Each is the CSS variable `--dg-<name>` in `src/styles/canvas.css`. */
export const CANVAS_COLORS = [
  'zone-orange',
  'zone-yellow',
  'zone-green',
  'zone-teal',
  'zone-blue',
  'zone-pink',
  'zone-red',
  'ground',
  'chrome',
  'grid',
  'grid-active',
  'grid-line',
  'grid-line-active',
  'panel',
  'panel-active',
  'raised',
  'line',
  'line-dim',
  'line-strong',
  'minimap-node',
  'minimap-mask',
  'text',
  'muted',
  'faint',
  'edge',
  'edge-strong',
  'particle',
  'select',
  'flow',
  'flow-ink',
  'ok',
  'warn',
  'error',
  'wire-http',
  'wire-rpc',
  'wire-data',
  'wire-messaging',
  'wire-text-http',
  'wire-text-rpc',
  'wire-text-data',
  'wire-text-messaging',
  'wire-ink',
] as const
export type CanvasColor = (typeof CANVAS_COLORS)[number]

/** The share of a node colour in the fill and in the outline of a coloured node, in percent. */
export const CANVAS_PERCENTS = ['hue-fill', 'hue-line'] as const
export type CanvasPercent = (typeof CANVAS_PERCENTS)[number]

/** The opacity from 0 to 1 of the elements that the explore view, the threat view and an idle flow step dim. */
export const CANVAS_OPACITIES = ['dim-explore', 'dim-threats', 'dim-art'] as const
export type CanvasOpacity = (typeof CANVAS_OPACITIES)[number]

export type CanvasToken = CanvasColor | CanvasPercent | CanvasOpacity

/**
 * The colours of the desktop window. `controls` and `symbols` colour the window buttons on Windows and Linux.
 * `border` colours the border of the active window on Windows.
 */
export const WINDOW_COLORS = ['controls', 'symbols', 'border'] as const
export type WindowColor = (typeof WINDOW_COLORS)[number]

/** The ids of the themes that come with the app, in the order of the theme menus. */
export const BUILT_IN_THEME_IDS = [
  'light',
  'dark',
  'light-high-contrast',
  'dark-high-contrast',
  'graphite',
  'blueprint',
  'circuit',
  'dusk',
  'graph-paper',
  'fog',
] as const
export type BuiltInThemeId = (typeof BUILT_IN_THEME_IDS)[number]

export const THEME_BASES = ['dark', 'light'] as const
export type ThemeBase = (typeof THEME_BASES)[number]

export const THEME_FILE_SUFFIX = '.theme.json'
export const THEMES_FOLDER = 'themes'
/** The most theme files that the app reads from a folder. */
export const MAX_THEME_FILES = 200
/** The largest theme file that the app reads. */
export const MAX_THEME_FILE_BYTES = 256 * 1024
/** The start of the id of a theme that the user adds. Built-in themes have ids without it. */
export const CUSTOM_THEME_PREFIX = 'custom:'
/** Matches the file name of a theme without {@link THEME_FILE_SUFFIX}. */
export const THEME_NAME_PATTERN = /^[a-z\d][a-z\d-]{0,63}$/
