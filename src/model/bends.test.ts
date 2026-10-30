import { describe, expect, it } from 'vitest'
import { followBends } from './bends'
import { createEdge, defaultCardData, defaultGroupData } from './defaults'
import type { DiagramEdge, DiagramNode } from './types'

const card = (id: string, x: number, y: number): DiagramNode => ({
  id,
  type: 'card',
  position: { x, y },
  width: 200,
  data: defaultCardData({ title: id }),
})
const a = card('a', 0, 0)
const b = card('b', 400, 200)
const bent: DiagramEdge = {
  ...createEdge('a', 'b'),
  data: {
    ...createEdge('a', 'b').data!,
    bends: [
      { x: 300, y: 30 },
      { x: 300, y: 230 },
    ],
  },
}
const move = (node: DiagramNode, dx: number, dy: number): DiagramNode => ({
  ...node,
  position: { x: node.position.x + dx, y: node.position.y + dy },
})

describe('followBends', () => {
  it('moves the corners with both ends when they move together', () => {
    const [edge] = followBends([bent], [a, b], [move(a, 40, 16), move(b, 40, 16)])
    expect(edge!.data!.bends).toEqual([
      { x: 340, y: 46 },
      { x: 340, y: 246 },
    ])
  })

  it('moves the corners with a group that holds both ends', () => {
    const group: DiagramNode = {
      id: 'g',
      type: 'group',
      position: { x: 0, y: 0 },
      width: 800,
      height: 400,
      data: defaultGroupData(),
    }
    const inside = [group, { ...a, parentId: 'g' }, { ...b, parentId: 'g' }]
    const [edge] = followBends([bent], inside, [move(group, 32, 0), ...inside.slice(1)])
    expect(edge!.data!.bends![0]).toEqual({ x: 332, y: 30 })
  })

  it('keeps the corners when one end moves, and drops them after a layout', () => {
    expect(followBends([bent], [a, b], [move(a, 0, 80), b])).toEqual([bent])
    const [edge] = followBends([bent], [a, b], [move(a, 0, 80), b], { dropWhenApart: true })
    expect(edge!.data!.bends).toBeUndefined()
  })

  it('returns the same edges when nothing moved', () => {
    const edges = [bent]
    expect(followBends(edges, [a, b], [a, b], { dropWhenApart: true })).toBe(edges)
  })
})
