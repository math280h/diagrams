import { describe, expect, it } from 'vitest'
import { routeFits, routePath } from './geometry'

const source = { x: 0, y: 0, width: 200, height: 60 }
const target = { x: 400, y: 100, width: 200, height: 60 }
const route = [
  { x: 200, y: 30 },
  { x: 300, y: 30 },
  { x: 300, y: 130 },
  { x: 400, y: 130 },
]

describe('routeFits', () => {
  it('accepts a route whose ends touch both nodes', () => {
    expect(routeFits(route, source, target)).toBe(true)
  })

  it('rejects a route after a node moved', () => {
    expect(routeFits(route, source, { ...target, x: 480 })).toBe(false)
    expect(routeFits(route, { ...source, y: 40 }, target)).toBe(false)
  })

  it('rejects a route that starts inside a node instead of on its border', () => {
    expect(routeFits([{ x: 100, y: 30 }, ...route.slice(1)], source, target)).toBe(false)
  })

  it('rejects a route with fewer than two points', () => {
    expect(routeFits([{ x: 200, y: 30 }], source, target)).toBe(false)
  })
})

describe('routePath', () => {
  it('draws straight segments and round corners', () => {
    expect(routePath(route, 12)).toBe('M200,30 L288,30 Q300,30 300,42 L300,118 Q300,130 312,130 L400,130')
  })

  it('makes a corner no larger than half of its shorter segment', () => {
    const path = routePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 100 },
      ],
      12,
    )
    expect(path).toBe('M0,0 L5,0 Q10,0 10,5 L10,100')
  })

  it('draws sharp corners with a radius of zero', () => {
    expect(routePath(route, 0)).toBe('M200,30 L300,30 Q300,30 300,30 L300,130 Q300,130 300,130 L400,130')
  })
})
