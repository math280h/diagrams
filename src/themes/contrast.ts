import { COLORS } from '@/model/colors'
import type { Theme } from './schema'
import { addThemeStyles } from './styles'

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

const ZONES = COLORS.filter((color) => color !== 'neutral')
const PROTOCOLS = ['http', 'rpc', 'data', 'messaging'] as const

const hueFill = (zone: string, ground: string) =>
  `color-mix(in oklab, var(--dg-zone-${zone}) var(--dg-hue-fill), var(${ground}))`
const hueLine = (zone: string) => `color-mix(in oklab, var(--dg-zone-${zone}) var(--dg-hue-line), var(--dg-panel))`

/** Lists the pairs of canvas colours that must be told apart, with the contrast that each pair needs. */
export function canvasContrastPairs(high: boolean): ContrastPair[] {
  const text = high ? 7 : 4.5
  const line = high ? 4.5 : 3
  const pairs: ContrastPair[] = []
  const add = (name: string, front: string, back: string, min: number) => pairs.push({ name, front, back, min })
  for (const back of ['--dg-ground', '--dg-panel', '--dg-raised']) {
    for (const token of ['--dg-text', '--dg-muted', '--dg-select'])
      add(`${token} on ${back}`, `var(${token})`, `var(${back})`, text)
    add(`--dg-faint on ${back}`, 'var(--dg-faint)', `var(${back})`, high ? text : 3)
  }
  for (const back of ['--dg-ground', '--dg-panel']) {
    for (const token of ['--dg-line', '--dg-line-strong', '--dg-edge', '--dg-edge-strong', '--dg-flow'])
      add(`${token} on ${back}`, `var(${token})`, `var(${back})`, high ? line : 0)
    add(`--dg-line-dim on ${back}`, 'var(--dg-line-dim)', `var(${back})`, high ? 3 : 0)
  }
  for (const token of ['--dg-ok', '--dg-warn', '--dg-error'])
    add(`${token} on --dg-ground`, `var(${token})`, 'var(--dg-ground)', high ? text : 3)
  add('--dg-flow-ink on --dg-flow', 'var(--dg-flow-ink)', 'var(--dg-flow)', text)
  for (const protocol of PROTOCOLS) {
    add(`wire text ${protocol} on ground`, `var(--dg-wire-text-${protocol})`, 'var(--dg-ground)', text)
    add(`wire ink on wire text ${protocol}`, 'var(--dg-wire-ink)', `var(--dg-wire-text-${protocol})`, text)
    add(`wire ${protocol} on ground`, `var(--dg-wire-${protocol})`, 'var(--dg-ground)', high ? line : 0)
  }
  for (const zone of ZONES) {
    add(`zone ${zone} text on ground`, `var(--dg-zone-${zone})`, 'var(--dg-ground)', high ? text : 0)
    add(`text on ${zone} card`, 'var(--dg-text)', hueFill(zone, '--dg-panel'), text)
    add(`muted on ${zone} card`, 'var(--dg-muted)', hueFill(zone, '--dg-panel'), text)
    add(`${zone} card outline on ground`, hueLine(zone), 'var(--dg-ground)', high ? line : 0)
  }
  return pairs.filter((pair) => pair.min > 0)
}

/** Lists the pairs of app colours that must be told apart, with the contrast that each pair needs. */
export function appContrastPairs(high: boolean): ContrastPair[] {
  const text = high ? 7 : 4.5
  const pairs: ContrastPair[] = []
  const add = (name: string, front: string, back: string, min: number) => pairs.push({ name, front, back, min })
  for (const back of ['background', 'card', 'popover', 'panel', 'muted', 'accent', 'secondary', 'raised']) {
    add(`--foreground on --${back}`, 'var(--foreground)', `var(--${back})`, text)
    add(`--muted-foreground on --${back}`, 'var(--muted-foreground)', `var(--${back})`, text)
  }
  for (const back of ['background', 'card', 'panel']) {
    for (const token of ['faint', 'destructive', 'warn', 'ok']) {
      add(`--${token} on --${back}`, `var(--${token})`, `var(--${back})`, text)
    }
    add(`--focus on --${back}`, 'var(--focus)', `var(--${back})`, 3)
  }
  add('--primary-foreground on --primary', 'var(--primary-foreground)', 'var(--primary)', text)
  add('--primary-foreground on --primary-hover', 'var(--primary-foreground)', 'var(--primary-hover)', text)
  add('--flow-ink on --flow', 'var(--flow-ink)', 'var(--flow)', text)
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
