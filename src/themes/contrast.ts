import { COLORS, type Color } from '@/model/colors'
import type { Theme } from './schema'
import { addThemeStyles } from './styles'
import {
  APP_COLOR_VARIABLES,
  CANVAS_COLOR_VARIABLES,
  CANVAS_PERCENT_VARIABLES,
  type AppColor,
  type CanvasColor,
} from './tokens'

type RGB = readonly [number, number, number]

/** Two colours that must be told apart, as CSS colours, and the contrast ratio that they need. */
export interface ContrastPair {
  name: string
  front: string
  back: string
  min: number
}

export interface ContrastFailure {
  name: string
  ratio: number
  min: number
}

const ZONES = COLORS.filter((color): color is Exclude<Color, 'neutral'> => color !== 'neutral')
const PROTOCOLS = ['http', 'rpc', 'data', 'messaging'] as const

const canvasColor = (key: CanvasColor) => `var(${CANVAS_COLOR_VARIABLES[key]})`
const appColor = (key: AppColor) => `var(${APP_COLOR_VARIABLES[key]})`
const hueFill = (zone: CanvasColor) =>
  `color-mix(in oklab, ${canvasColor(zone)} var(${CANVAS_PERCENT_VARIABLES['hue-fill']}), ${canvasColor('node')})`
const hueLine = (zone: CanvasColor) =>
  `color-mix(in oklab, ${canvasColor(zone)} var(${CANVAS_PERCENT_VARIABLES['hue-line']}), ${canvasColor('node')})`

/**
 * Lists the pairs of canvas colours that must be told apart, with the contrast that each pair needs. Each name has the
 * keys of a theme file.
 */
export function canvasContrastPairs(high: boolean): ContrastPair[] {
  const text = high ? 7 : 4.5
  const line = high ? 4.5 : 3
  const pairs: ContrastPair[] = []
  const add = (name: string, front: string, back: string, min: number) => pairs.push({ name, front, back, min })
  const addKeys = (front: CanvasColor, back: CanvasColor, min: number) =>
    add(`canvas.${front} on canvas.${back}`, canvasColor(front), canvasColor(back), min)
  for (const back of ['background', 'node', 'raised'] as const) {
    for (const front of ['text', 'muted-text', 'selection'] as const) addKeys(front, back, text)
    addKeys('faint-text', back, high ? text : 3)
  }
  for (const back of ['background', 'node'] as const) {
    for (const front of ['border', 'border-strong', 'connection', 'connection-arrow', 'flow'] as const)
      addKeys(front, back, high ? line : 0)
    addKeys('border-idle', back, high ? 3 : 0)
  }
  for (const front of ['ok', 'warn', 'error'] as const) addKeys(front, 'background', high ? text : 3)
  addKeys('flow-text', 'flow', text)
  for (const protocol of PROTOCOLS) {
    addKeys(`protocol-${protocol}-text`, 'background', text)
    addKeys('protocol-token-text', `protocol-${protocol}-text`, text)
    addKeys(`protocol-${protocol}`, 'background', high ? line : 0)
  }
  for (const zone of ZONES) {
    addKeys(zone, 'background', high ? text : 0)
    add(`canvas.text on ${zone} nodes`, canvasColor('text'), hueFill(zone), text)
    add(`canvas.muted-text on ${zone} nodes`, canvasColor('muted-text'), hueFill(zone), text)
    add(`${zone} node outline on canvas.background`, hueLine(zone), canvasColor('background'), high ? line : 0)
  }
  return pairs.filter((pair) => pair.min > 0)
}

/**
 * Lists the pairs of app colours that must be told apart, with the contrast that each pair needs. Each name has the
 * keys of a theme file.
 */
export function appContrastPairs(high: boolean): ContrastPair[] {
  const text = high ? 7 : 4.5
  const pairs: ContrastPair[] = []
  const add = (front: AppColor, back: AppColor, min: number) =>
    pairs.push({ name: `app.${front} on app.${back}`, front: appColor(front), back: appColor(back), min })
  const backs = [
    'background',
    'card',
    'popup',
    'panel',
    'muted-fill',
    'highlight',
    'secondary-action',
    'raised',
  ] as const
  for (const back of backs) {
    add('text', back, text)
    add('muted-text', back, text)
  }
  for (const back of ['background', 'card', 'panel'] as const) {
    for (const front of ['flow-pending', 'error', 'warn', 'ok'] as const) add(front, back, text)
    add('focus-ring', back, 3)
  }
  add('action-text', 'action', text)
  add('action-text', 'action-hover', text)
  add('flow-text', 'flow', text)
  return pairs
}

function luminance([r, g, b]: RGB): number {
  const linear = (channel: number) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** Returns the WCAG contrast ratio of two colours, from 1 to 21. */
export function contrastRatio(a: RGB, b: RGB): number {
  const [light, dark] = [luminance(a), luminance(b)].toSorted((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

let probe: CanvasRenderingContext2D | null = null

function resolveColor(element: HTMLElement, css: string): RGB {
  probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
  element.style.color = css
  probe.clearRect(0, 0, 1, 1)
  probe.fillStyle = getComputedStyle(element).color
  probe.fillRect(0, 0, 1, 1)
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data
  return [r!, g!, b!]
}

function failures(swatch: HTMLElement, pairs: readonly ContrastPair[]): ContrastFailure[] {
  return pairs.flatMap((pair) => {
    const ratio = contrastRatio(resolveColor(swatch, pair.front), resolveColor(swatch, pair.back))
    return ratio < pair.min ? [{ name: pair.name, ratio, min: pair.min }] : []
  })
}

/**
 * Measures the colour pairs of a theme on the page. A theme with high contrast needs 7:1 for text and 4.5:1 for lines.
 *
 * @returns The pairs below their contrast. An empty list means that the theme meets each pair.
 */
export function checkThemeContrast(theme: Theme): ContrastFailure[] {
  addThemeStyles([theme])
  const high = theme.contrast === 'high'
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden'
  const canvas = Object.assign(document.createElement('div'), { className: 'dg-canvas' })
  canvas.dataset.base = theme.base
  canvas.dataset.theme = theme.id
  const app = document.createElement('div')
  app.dataset.appBase = theme.base
  app.dataset.appTheme = theme.id
  const canvasSwatch = document.createElement('span')
  const appSwatch = document.createElement('span')
  canvas.append(canvasSwatch)
  app.append(appSwatch)
  host.append(canvas, app)
  document.body.append(host)
  try {
    return [...failures(canvasSwatch, canvasContrastPairs(high)), ...failures(appSwatch, appContrastPairs(high))]
  } finally {
    host.remove()
  }
}
