import { afterEach, expect, it, vi } from 'vitest'
import { captureBlob } from './capture'

const SVG_NS = 'http://www.w3.org/2000/svg'
const cleanups: (() => void)[] = []

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.restoreAllMocks()
})

function svgElement(tag: string, attributes: Record<string, string>) {
  const element = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  return element
}

it('captures an SVG next to a pseudo-element rule of an escaped class name without a selector error', async () => {
  const style = document.createElement('style')
  style.textContent = String.raw`
    .group-data-horizontal\/tabs\:after\:h-0\.5:is(:where(.group\/tabs):where([data-orientation="horizontal"]) *):after {
      height: 2px;
    }`
  const svg = svgElement('svg', { width: '80', height: '40' })
  svg.append(
    svgElement('rect', { x: '4', y: '4', width: '20', height: '10', fill: 'red' }),
    svgElement('circle', { cx: '50', cy: '20', r: '8' }),
  )
  const root = document.createElement('div')
  root.append(svg)
  document.head.append(style)
  document.body.append(root)
  cleanups.push(
    () => style.remove(),
    () => root.remove(),
  )
  const matches = vi.spyOn(Element.prototype, 'matches')

  const blob = await captureBlob(root, 'png', {})

  expect(blob.size).toBeGreaterThan(0)
  expect(matches.mock.results.filter((result) => result.type === 'throw')).toEqual([])
})
