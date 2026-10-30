import { describe, expect, it } from 'vitest'
import type { XY } from '@/model/schema'
import type { Rect } from '@/model/rect'
import { routeEdges, type RouterNode } from './router'

const card = (id: string, x: number, y: number, parentId?: string): RouterNode => ({
  id,
  rect: { x, y, width: 200, height: 60 },
  parentId,
})

function segments(route: XY[]) {
  return route.slice(1).map((point, index) => [route[index]!, point] as const)
}

function crossesInside(route: XY[], rect: Rect) {
  return segments(route).some(([a, b]) => {
    const left = Math.min(a.x, b.x)
    const right = Math.max(a.x, b.x)
    const top = Math.min(a.y, b.y)
    const bottom = Math.max(a.y, b.y)
    return right > rect.x && left < rect.x + rect.width && bottom > rect.y && top < rect.y + rect.height
  })
}

function onBorder(point: XY, rect: Rect) {
  const insideX = point.x >= rect.x - 0.5 && point.x <= rect.x + rect.width + 0.5
  const insideY = point.y >= rect.y - 0.5 && point.y <= rect.y + rect.height + 0.5
  const onVertical = Math.abs(point.x - rect.x) < 0.5 || Math.abs(point.x - rect.x - rect.width) < 0.5
  const onHorizontal = Math.abs(point.y - rect.y) < 0.5 || Math.abs(point.y - rect.y - rect.height) < 0.5
  return (onVertical && insideY) || (onHorizontal && insideX)
}

describe('routeEdges', () => {
  it('goes around a card between the ends, at right angles, from border to border', () => {
    const nodes = [card('a', 0, 0), card('block', 400, 0), card('b', 800, 0)]
    const route = routeEdges(nodes, [{ id: 'e', source: 'a', target: 'b' }]).get('e')!
    expect(crossesInside(route, nodes[1]!.rect)).toBe(false)
    expect(onBorder(route[0]!, nodes[0]!.rect)).toBe(true)
    expect(onBorder(route.at(-1)!, nodes[2]!.rect)).toBe(true)
    for (const [a, b] of segments(route)) expect(a.x === b.x || a.y === b.y).toBe(true)
  })

  it('keeps out of a group that holds neither end, and enters the group that holds an end', () => {
    const other: RouterNode = { id: 'other', rect: { x: 300, y: -100, width: 300, height: 260 } }
    const home: RouterNode = { id: 'home', rect: { x: 700, y: -100, width: 300, height: 260 } }
    const nodes = [card('a', 0, 0), other, card('inside-other', 350, 0, 'other'), home, card('b', 750, 0, 'home')]
    const route = routeEdges(nodes, [{ id: 'e', source: 'a', target: 'b' }]).get('e')!
    expect(crossesInside(route, other.rect)).toBe(false)
    expect(onBorder(route.at(-1)!, nodes[4]!.rect)).toBe(true)
  })

  it('moves routes that share a channel apart', () => {
    const nodes = [card('a', 0, 0), card('b', 600, 300), card('c', 600, 500)]
    const routes = routeEdges(nodes, [
      { id: 'ab', source: 'a', target: 'b' },
      { id: 'ac', source: 'a', target: 'c' },
    ])
    const vertical = (route: XY[]) =>
      segments(route)
        .filter(([a, b]) => a.x === b.x && Math.abs(a.y - b.y) > 40)
        .map(([a]) => a.x)
    const ab = vertical(routes.get('ab')!)
    const ac = vertical(routes.get('ac')!)
    for (const x of ab) for (const other of ac) expect(Math.abs(x - other)).toBeGreaterThanOrEqual(6)
  })

  it('starts and ends a route with fixed sides on those sides', () => {
    const nodes = [card('a', 0, 0), card('b', 400, 300)]
    const route = routeEdges(nodes, [
      { id: 'e', source: 'a', target: 'b', sourceSide: 'bottom', targetSide: 'left' },
    ]).get('e')!
    expect(route[0]).toEqual({ x: 100, y: 60 })
    expect(route.at(-1)).toEqual({ x: 400, y: 330 })
  })

  it('leaves out an edge between a node and itself', () => {
    expect(routeEdges([card('a', 0, 0)], [{ id: 'loop', source: 'a', target: 'a' }]).has('loop')).toBe(false)
  })
})
