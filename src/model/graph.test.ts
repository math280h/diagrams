import { describe, expect, it } from 'vitest'
import { relativePosition } from './graph'

describe('relativePosition', () => {
  it('gives the position inside the parent', () => {
    expect(relativePosition({ x: 120, y: 80 }, { x: 100, y: 50 })).toEqual({ x: 20, y: 30 })
  })

  it('gives only the x and y of a rectangle without a parent, in a new object', () => {
    const rect = { x: 750, y: 50, width: 200, height: 80 }
    const position = relativePosition(rect, undefined)
    expect(position).toEqual({ x: 750, y: 50 })
    expect(position).not.toBe(rect)
  })
})
