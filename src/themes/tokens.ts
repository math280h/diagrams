/** The colours of the app around the canvas, with the CSS variable in `src/index.css` that each colour sets. */
export const APP_COLOR_VARIABLES = {
  background: '--background',
  text: '--foreground',
  card: '--card',
  'card-text': '--card-foreground',
  popup: '--popover',
  'popup-text': '--popover-foreground',
  action: '--primary',
  'action-hover': '--primary-hover',
  'action-text': '--primary-foreground',
  'secondary-action': '--secondary',
  'secondary-action-text': '--secondary-foreground',
  'muted-fill': '--muted',
  'muted-text': '--muted-foreground',
  'flow-pending': '--faint',
  highlight: '--accent',
  'highlight-text': '--accent-foreground',
  error: '--destructive',
  border: '--border',
  input: '--input',
  'focus-ring': '--focus',
  panel: '--panel',
  'panel-border': '--panel-border',
  raised: '--raised',
  flow: '--flow',
  'flow-text': '--flow-ink',
  ok: '--ok',
  info: '--info',
  warn: '--warn',
} as const
export type AppColor = keyof typeof APP_COLOR_VARIABLES
export const APP_COLORS = Object.keys(APP_COLOR_VARIABLES) as readonly AppColor[]

/** The colours of the canvas, with the CSS variable in `src/styles/canvas.css` that each colour sets. */
export const CANVAS_COLOR_VARIABLES = {
  orange: '--dg-zone-orange',
  yellow: '--dg-zone-yellow',
  green: '--dg-zone-green',
  teal: '--dg-zone-teal',
  blue: '--dg-zone-blue',
  pink: '--dg-zone-pink',
  red: '--dg-zone-red',
  background: '--dg-ground',
  overlay: '--dg-chrome',
  'grid-dot': '--dg-grid',
  'grid-dot-drag': '--dg-grid-active',
  'grid-line': '--dg-grid-line',
  'grid-line-drag': '--dg-grid-line-active',
  node: '--dg-panel',
  'node-highlight': '--dg-panel-active',
  raised: '--dg-raised',
  border: '--dg-line',
  'border-idle': '--dg-line-dim',
  'border-strong': '--dg-line-strong',
  'minimap-node': '--dg-minimap-node',
  'minimap-mask': '--dg-minimap-mask',
  text: '--dg-text',
  'muted-text': '--dg-muted',
  'faint-text': '--dg-faint',
  connection: '--dg-edge',
  'connection-arrow': '--dg-edge-strong',
  traffic: '--dg-particle',
  selection: '--dg-select',
  flow: '--dg-flow',
  'flow-text': '--dg-flow-ink',
  ok: '--dg-ok',
  warn: '--dg-warn',
  error: '--dg-error',
  'protocol-http': '--dg-wire-http',
  'protocol-rpc': '--dg-wire-rpc',
  'protocol-data': '--dg-wire-data',
  'protocol-messaging': '--dg-wire-messaging',
  'protocol-http-text': '--dg-wire-text-http',
  'protocol-rpc-text': '--dg-wire-text-rpc',
  'protocol-data-text': '--dg-wire-text-data',
  'protocol-messaging-text': '--dg-wire-text-messaging',
  'protocol-token-text': '--dg-wire-ink',
} as const
export type CanvasColor = keyof typeof CANVAS_COLOR_VARIABLES
export const CANVAS_COLORS = Object.keys(CANVAS_COLOR_VARIABLES) as readonly CanvasColor[]

/** The share of a node colour in the fill and in the outline of a coloured node, in percent. */
export const CANVAS_PERCENT_VARIABLES = { 'hue-fill': '--dg-hue-fill', 'hue-line': '--dg-hue-line' } as const
export type CanvasPercent = keyof typeof CANVAS_PERCENT_VARIABLES
export const CANVAS_PERCENTS = Object.keys(CANVAS_PERCENT_VARIABLES) as readonly CanvasPercent[]

/**
 * The opacity from 0 to 1 of the elements that the explore view and the threat view dim, and of the icon images of
 * an idle flow step.
 */
export const CANVAS_OPACITY_VARIABLES = {
  'dim-explore': '--dg-dim-explore',
  'dim-threats': '--dg-dim-threats',
  'dim-flow-icons': '--dg-dim-art',
} as const
export type CanvasOpacity = keyof typeof CANVAS_OPACITY_VARIABLES
export const CANVAS_OPACITIES = Object.keys(CANVAS_OPACITY_VARIABLES) as readonly CanvasOpacity[]

export type CanvasToken = CanvasColor | CanvasPercent | CanvasOpacity

export const CANVAS_TOKEN_VARIABLES: Readonly<Record<CanvasToken, string>> = {
  ...CANVAS_COLOR_VARIABLES,
  ...CANVAS_PERCENT_VARIABLES,
  ...CANVAS_OPACITY_VARIABLES,
}

/**
 * The colours of the desktop window. `button-background` and `button-symbols` colour the window buttons on Windows
 * and Linux. `border` colours the border of the active window on Windows.
 */
export const WINDOW_COLORS = ['button-background', 'button-symbols', 'border'] as const
export type WindowColor = (typeof WINDOW_COLORS)[number]

export const THEME_KEY_GROUPS = ['app', 'canvas', 'window'] as const
export type ThemeKeyGroup = (typeof THEME_KEY_GROUPS)[number]

/**
 * The earlier names of theme keys, with the key that each name reads as. A theme file that has an earlier name and
 * its key gets the value of the key.
 *
 * @see `src/themes/released-keys.json` for the keys of each release.
 */
export const THEME_KEY_ALIASES = {
  app: {
    foreground: 'text',
    'card-foreground': 'card-text',
    popover: 'popup',
    'popover-foreground': 'popup-text',
    primary: 'action',
    'primary-hover': 'action-hover',
    'primary-foreground': 'action-text',
    secondary: 'secondary-action',
    'secondary-foreground': 'secondary-action-text',
    muted: 'muted-fill',
    'muted-foreground': 'muted-text',
    faint: 'flow-pending',
    accent: 'highlight',
    'accent-foreground': 'highlight-text',
    destructive: 'error',
    focus: 'focus-ring',
    'flow-ink': 'flow-text',
  },
  canvas: {
    'zone-orange': 'orange',
    'zone-yellow': 'yellow',
    'zone-green': 'green',
    'zone-teal': 'teal',
    'zone-blue': 'blue',
    'zone-pink': 'pink',
    'zone-red': 'red',
    ground: 'background',
    chrome: 'overlay',
    grid: 'grid-dot',
    'grid-active': 'grid-dot-drag',
    'grid-line-active': 'grid-line-drag',
    panel: 'node',
    'panel-active': 'node-highlight',
    line: 'border',
    'line-dim': 'border-idle',
    'line-strong': 'border-strong',
    muted: 'muted-text',
    faint: 'faint-text',
    edge: 'connection',
    'edge-strong': 'connection-arrow',
    particle: 'traffic',
    select: 'selection',
    'flow-ink': 'flow-text',
    'wire-http': 'protocol-http',
    'wire-rpc': 'protocol-rpc',
    'wire-data': 'protocol-data',
    'wire-messaging': 'protocol-messaging',
    'wire-text-http': 'protocol-http-text',
    'wire-text-rpc': 'protocol-rpc-text',
    'wire-text-data': 'protocol-data-text',
    'wire-text-messaging': 'protocol-messaging-text',
    'wire-ink': 'protocol-token-text',
    'dim-art': 'dim-flow-icons',
  },
  window: {
    controls: 'button-background',
    symbols: 'button-symbols',
  },
} as const satisfies {
  app: Readonly<Record<string, AppColor>>
  canvas: Readonly<Record<string, CanvasToken>>
  window: Readonly<Record<string, WindowColor>>
}

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
