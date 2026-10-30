import { afterAll, describe, expect, it } from 'vitest'
import { COLORS } from '@/model/colors'
import './canvas.css'

type RGB = readonly [number, number, number]

const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!

function resolve(element: HTMLElement, css: string): RGB {
  element.style.color = css
  probe.clearRect(0, 0, 1, 1)
  probe.fillStyle = getComputedStyle(element).color
  probe.fillRect(0, 0, 1, 1)
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data
  return [r!, g!, b!]
}

function luminance([r, g, b]: RGB): number {
  const linear = (channel: number) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

function ratio(a: RGB, b: RGB): number {
  const [light, dark] = [luminance(a), luminance(b)].toSorted((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

const hueFill = (zone: string, ground: string) =>
  `color-mix(in oklab, var(--dg-zone-${zone}) var(--dg-hue-fill), var(${ground}))`
const hueLine = (zone: string) => `color-mix(in oklab, var(--dg-zone-${zone}) var(--dg-hue-line), var(--dg-panel))`
const ZONES = COLORS.filter((color) => color !== 'neutral')
const PROTOCOLS = ['http', 'rpc', 'data', 'messaging'] as const

/** Lists the pairs of canvas colours that must be told apart, with the contrast that each pair needs. */
function pairs(high: boolean) {
  const text = high ? 7 : 4.5
  const line = high ? 4.5 : 3
  const grounds = ['--dg-ground', '--dg-panel', '--dg-raised']
  const list: { name: string; front: string; back: string; min: number }[] = []
  for (const back of grounds) {
    for (const token of ['--dg-text', '--dg-muted', '--dg-select'])
      list.push({ name: `${token} on ${back}`, front: `var(${token})`, back: `var(${back})`, min: text })
    list.push({ name: `--dg-faint on ${back}`, front: 'var(--dg-faint)', back: `var(${back})`, min: high ? text : 3 })
  }
  for (const back of ['--dg-ground', '--dg-panel']) {
    for (const token of ['--dg-line', '--dg-line-strong', '--dg-edge', '--dg-edge-strong', '--dg-flow'])
      list.push({ name: `${token} on ${back}`, front: `var(${token})`, back: `var(${back})`, min: high ? line : 0 })
    list.push({
      name: `--dg-line-dim on ${back}`,
      front: 'var(--dg-line-dim)',
      back: `var(${back})`,
      min: high ? 3 : 0,
    })
  }
  for (const token of ['--dg-ok', '--dg-warn', '--dg-error'])
    list.push({
      name: `${token} on --dg-ground`,
      front: `var(${token})`,
      back: 'var(--dg-ground)',
      min: high ? text : 3,
    })
  list.push({ name: '--dg-flow-ink on --dg-flow', front: 'var(--dg-flow-ink)', back: 'var(--dg-flow)', min: text })
  for (const protocol of PROTOCOLS) {
    list.push({
      name: `wire text ${protocol} on ground`,
      front: `var(--dg-wire-text-${protocol})`,
      back: 'var(--dg-ground)',
      min: text,
    })
    list.push({
      name: `wire ink on wire text ${protocol}`,
      front: 'var(--dg-wire-ink)',
      back: `var(--dg-wire-text-${protocol})`,
      min: text,
    })
    list.push({
      name: `wire ${protocol} on ground`,
      front: `var(--dg-wire-${protocol})`,
      back: 'var(--dg-ground)',
      min: high ? line : 0,
    })
  }
  for (const zone of ZONES) {
    list.push({
      name: `zone ${zone} text on ground`,
      front: `var(--dg-zone-${zone})`,
      back: 'var(--dg-ground)',
      min: high ? text : 0,
    })
    list.push({ name: `text on ${zone} card`, front: 'var(--dg-text)', back: hueFill(zone, '--dg-panel'), min: text })
    list.push({ name: `muted on ${zone} card`, front: 'var(--dg-muted)', back: hueFill(zone, '--dg-panel'), min: text })
    list.push({
      name: `${zone} card outline on ground`,
      front: hueLine(zone),
      back: 'var(--dg-ground)',
      min: high ? line : 0,
    })
  }
  return list
}

const results: string[] = []

describe.each(['dark', 'light'] as const)('the %s canvas', (theme) => {
  it.each([false, true])('meets the contrast of its pairs (high contrast: %s)', (high) => {
    const canvas = document.createElement('div')
    canvas.className = 'dg-canvas'
    canvas.dataset.theme = theme
    if (high) canvas.dataset.contrast = 'more'
    const swatch = document.createElement('span')
    canvas.append(swatch)
    document.body.append(canvas)
    const failures: string[] = []
    for (const pair of pairs(high)) {
      const value = ratio(resolve(swatch, pair.front), resolve(swatch, pair.back))
      results.push(`${theme}${high ? ' high' : ''}\t${value.toFixed(2)}\t${pair.min}\t${pair.name}`)
      if (value < pair.min) failures.push(`${pair.name}: ${value.toFixed(2)} < ${pair.min}`)
    }
    canvas.remove()
    expect(failures).toEqual([])
  })
})

afterAll(() => {
  console.log(results.join('\n'))
})
