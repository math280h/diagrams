import { describe, expect, it } from 'vitest'
import { bendsWithSegmentAt, manualRoute, middleSegments, routeFits, routePath } from './geometry'

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

describe('manualRoute', () => {
  const bends = route.slice(1, -1)

  it('gives back the route that the corners came from while the nodes stay', () => {
    expect(manualRoute(source, target, bends)).toEqual(route)
  })

  it('keeps the corners and attaches the ends again after a node moves', () => {
    const moved = manualRoute({ ...source, y: 10 }, { ...target, x: 480 }, bends)
    expect(moved[0]).toEqual({ x: 200, y: 30 })
    expect(moved.slice(1, 3)).toEqual(bends)
    expect(moved.at(-1)).toEqual({ x: 480, y: 130 })
  })

  it('turns at a right angle when a corner is not level with its node', () => {
    expect(
      manualRoute(source, target, [
        { x: 300, y: 200 },
        { x: 500, y: 200 },
      ]),
    ).toEqual([
      { x: 200, y: 30 },
      { x: 300, y: 30 },
      { x: 300, y: 200 },
      { x: 500, y: 200 },
      { x: 500, y: 160 },
    ])
  })
})

describe('middleSegments', () => {
  it('lists the segments that touch no node, with the axis that each one moves along', () => {
    expect(middleSegments(route)).toEqual([{ index: 1, axis: 'x', middle: { x: 300, y: 80 } }])
    expect(middleSegments(route.slice(0, 3))).toEqual([])
  })

  it('moves a segment across its direction and returns the corners', () => {
    const [segment] = middleSegments(route)
    expect(bendsWithSegmentAt(route, segment!, 340)).toEqual([
      { x: 340, y: 30 },
      { x: 340, y: 130 },
    ])
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
