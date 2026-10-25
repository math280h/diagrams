import { describe, expect, it } from 'vitest'
import { buildArcTable, parsePath, pointAt } from './path-sampler'

describe('parsePath', () => {
  it('reads lines, quadratic and cubic segments', () => {
    const segments = parsePath('M0,0 L10,0 Q20,0 20,10 C20,20 30,30 40,40')
    expect(segments.map((segment) => segment.kind)).toEqual(['line', 'quad', 'cubic'])
  })

  it('reads space separated numbers and implicit line commands after M', () => {
    const segments = parsePath('M 0 0 10 0 10 10')
    expect(segments).toHaveLength(2)
    expect(segments[1]).toMatchObject({ kind: 'line', x0: 10, y0: 0, x1: 10, y1: 10 })
  })
})

describe('buildArcTable', () => {
  it('measures a straight line', () => {
    const table = buildArcTable('M0,0 L100,0')
    expect(table.lengthPx).toBeCloseTo(100, 5)
    expect(table.minX).toBe(0)
    expect(table.maxX).toBe(100)
  })

  it('places points at equal distances on a polyline', () => {
    const table = buildArcTable('M0,0 L100,0 L100,100')
    expect(table.lengthPx).toBeCloseTo(200, 5)
    const middle = pointAt(table, 0.5)
    expect(middle.x).toBeCloseTo(100, 0)
    expect(middle.y).toBeCloseTo(0, 0)
    const threeQuarters = pointAt(table, 0.75)
    expect(threeQuarters.x).toBeCloseTo(100, 0)
    expect(threeQuarters.y).toBeCloseTo(50, 0)
  })

  it('gives a tangent angle that follows the path', () => {
    const table = buildArcTable('M0,0 L0,100')
    expect(pointAt(table, 0.5).angleRad).toBeCloseTo(Math.PI / 2, 5)
  })

  it('returns an empty table for empty path data', () => {
    expect(buildArcTable('').lengthPx).toBe(0)
  })
})

describe('pointAt', () => {
  it('clamps values outside 0 to 1', () => {
    const table = buildArcTable('M0,0 L50,0')
    expect(pointAt(table, -1).x).toBeCloseTo(0, 5)
    expect(pointAt(table, 2).x).toBeCloseTo(50, 5)
  })

  it('writes into the given object', () => {
    const table = buildArcTable('M0,0 L50,0')
    const out = { x: 0, y: 0, angleRad: 0 }
    expect(pointAt(table, 1, out)).toBe(out)
  })
})
