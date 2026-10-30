import { describe, expect, it } from 'vitest'
import { createEdge, defaultCardData, defaultGroupData } from '@/model/defaults'
import { absolutePosition, estimateSize } from '@/model/graph'
import { rectsOverlap } from '@/model/rect'
import type { DiagramEdge, DiagramNode } from '@/model/types'
import { keepPinned } from './pinned'

function card(id: string, x: number, y: number, extra: Partial<DiagramNode> = {}, pinned = false): DiagramNode {
  return {
    id,
    type: 'card',
    position: { x, y },
    width: 200,
    measured: { width: 200, height: 80 },
    data: defaultCardData({ title: id, ...(pinned ? { pinned: true } : {}) }),
    ...extra,
  } as DiagramNode
}

function group(id: string, x: number, y: number, width: number, height: number, pinned = false): DiagramNode {
  return {
    id,
    type: 'group',
    position: { x, y },
    width,
    height,
    data: defaultGroupData({ label: id, ...(pinned ? { pinned: true } : {}) }),
  }
}

function at(result: { nodes: DiagramNode[] }, id: string) {
  const byId = new Map(result.nodes.map((node) => [node.id, node]))
  return absolutePosition(byId.get(id)!, byId)
}

function rect(result: { nodes: DiagramNode[] }, id: string) {
  const node = result.nodes.find((candidate) => candidate.id === id)!
  return { ...at(result, id), ...estimateSize(node) }
}

const route = (edge: DiagramEdge) => edge.data?.route

describe('keepPinned', () => {
  it('returns the layout as it is when no node is pinned', () => {
    const laidOut = { nodes: [card('a', 0, 0)], edges: [] }
    expect(keepPinned([card('a', 500, 500)], [], laidOut)).toBe(laidOut)
  })

  it('arranges the other nodes around one pinned node and moves their routes with them', () => {
    const edge = createEdge('a', 'b')
    const before = [card('a', 1000, 500, {}, true), card('b', 0, 0), card('c', 0, 300)]
    const laidOutEdge = {
      ...edge,
      data: {
        ...edge.data!,
        route: [
          { x: 200, y: 40 },
          { x: 300, y: 40 },
        ],
      },
    }
    const bc = {
      ...createEdge('b', 'c'),
      data: {
        ...createEdge('b', 'c').data!,
        route: [
          { x: 400, y: 80 },
          { x: 400, y: 200 },
        ],
      },
    }
    const laidOut = {
      nodes: [card('a', 0, 0, {}, true), card('b', 300, 0), card('c', 300, 200)],
      edges: [laidOutEdge, bc],
    }
    const result = keepPinned(before, [edge, bc], laidOut)
    expect(at(result, 'a')).toEqual({ x: 1000, y: 500 })
    expect(at(result, 'b')).toEqual({ x: 1300, y: 500 })
    expect(at(result, 'c')).toEqual({ x: 1300, y: 700 })
    expect(route(result.edges[0]!)).toBeUndefined()
    expect(route(result.edges[1]!)).toEqual([
      { x: 1400, y: 580 },
      { x: 1400, y: 700 },
    ])
  })

  it('keeps two pinned nodes in place and moves the node between them out of their way', () => {
    const before = [card('a', 0, 0, {}, true), card('b', 900, 0), card('c', 300, 0, {}, true)]
    const laidOut = { nodes: [card('a', 0, 0, {}, true), card('b', 300, 0), card('c', 600, 0, {}, true)], edges: [] }
    const result = keepPinned(before, [], laidOut)
    expect(at(result, 'a')).toEqual({ x: 0, y: 0 })
    expect(at(result, 'c')).toEqual({ x: 300, y: 0 })
    expect(rectsOverlap(rect(result, 'b'), rect(result, 'a'))).toBe(false)
    expect(rectsOverlap(rect(result, 'b'), rect(result, 'c'))).toBe(false)
  })

  it('keeps everything in a pinned group as it was', () => {
    const before = [group('g', 500, 500, 300, 200, true), card('x', 32, 56, { parentId: 'g' }), card('y', 0, 0)]
    const laidOut = {
      nodes: [group('g', 0, 0, 280, 190, true), card('x', 40, 60, { parentId: 'g' }), card('y', 400, 0)],
      edges: [],
    }
    const result = keepPinned(before, [], laidOut)
    expect(result.nodes.find((node) => node.id === 'g')).toMatchObject({
      position: { x: 500, y: 500 },
      width: 300,
      height: 200,
    })
    expect(result.nodes.find((node) => node.id === 'x')!.position).toEqual({ x: 32, y: 56 })
    expect(at(result, 'y')).toEqual({ x: 900, y: 500 })
  })

  it('grows a group around a pinned node in it', () => {
    const before = [
      group('g', 0, 0, 300, 200),
      card('x', 800, 600, { parentId: 'g' }, true),
      card('y', 40, 60, { parentId: 'g' }),
    ]
    const laidOut = {
      nodes: [
        group('g', 0, 0, 300, 200),
        card('x', 40, 60, { parentId: 'g' }, true),
        card('y', 40, 200, { parentId: 'g' }),
      ],
      edges: [],
    }
    const result = keepPinned(before, [], laidOut)
    expect(at(result, 'x')).toEqual({ x: 800, y: 600 })
    const frame = rect(result, 'g')
    const inner = rect(result, 'x')
    expect(frame.x + frame.width).toBeGreaterThanOrEqual(inner.x + inner.width)
    expect(frame.y + frame.height).toBeGreaterThanOrEqual(inner.y + inner.height)
  })

  it('keeps the old route of an edge between two pinned nodes', () => {
    const edge = { ...createEdge('a', 'b'), data: { ...createEdge('a', 'b').data!, route: [{ x: 1, y: 2 }] } }
    const before = [card('a', 0, 0, {}, true), card('b', 600, 0, {}, true)]
    const laidOut = {
      nodes: [card('a', 0, 0, {}, true), card('b', 300, 0, {}, true)],
      edges: [{ ...edge, data: { ...edge.data, route: [{ x: 9, y: 9 }] } }],
    }
    expect(route(keepPinned(before, [edge], laidOut).edges[0]!)).toEqual([{ x: 1, y: 2 }])
  })
})
