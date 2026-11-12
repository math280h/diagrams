import { describe, expect, it } from 'vitest'
import { createEdge, defaultCardData, emptyDetails } from '@/model/defaults'
import type { CardNodeType } from '@/model/types'
import { toCanvasEdges, toCanvasNodes } from './canvas-elements'

function card(id: string, x = 0, pinned = false): CardNodeType {
  return {
    id,
    type: 'card',
    position: { x, y: 0 },
    data: defaultCardData({ title: id, ...(pinned ? { pinned: true } : {}) }),
  }
}

describe('toCanvasNodes', () => {
  it('keeps the object of each node that does not change', () => {
    const nodes = [card('API'), card('Postgres')]
    const before = toCanvasNodes(nodes, false, true)
    const moved = [{ ...nodes[0]!, position: { x: 80, y: 0 } }, nodes[1]!]
    const after = toCanvasNodes(moved, false, true)
    expect(after[0]).not.toBe(before[0])
    expect(after[0]?.position).toEqual({ x: 80, y: 0 })
    expect(after[1]).toBe(before[1])
  })

  it('names each node and marks pinned nodes only when the canvas is editable', () => {
    const nodes = [card('API', 0, true)]
    const [editable] = toCanvasNodes(nodes, false, true)
    const [readOnly] = toCanvasNodes(nodes, false, false)
    expect(editable).toMatchObject({ ariaRole: 'group', ariaLabel: 'API, service', className: 'dg-pinned' })
    expect(readOnly?.className).toBeUndefined()
    expect(toCanvasNodes(nodes, false, true)[0]).toBe(editable)
  })

  it('marks the nodes with details when the canvas shows details', () => {
    const node: CardNodeType = {
      ...card('API'),
      data: defaultCardData({ title: 'API', details: { ...emptyDetails(), owner: 'Payments team' } }),
    }
    expect(toCanvasNodes([node], true, false)[0]?.className).toBe('dg-has-details')
    expect(toCanvasNodes([node], false, false)[0]?.className).toBeUndefined()
  })
})

describe('toCanvasEdges', () => {
  it('keeps the object of an edge while its name does not change', () => {
    const nodes = [card('API'), card('Postgres')]
    const edges = [createEdge('API', 'Postgres', { label: 'SQL' })]
    const [before] = toCanvasEdges(edges, nodes)
    expect(before?.ariaLabel).toBe('API to Postgres, SQL')
    expect(toCanvasEdges(edges, [{ ...nodes[0]!, position: { x: 80, y: 0 } }, nodes[1]!])[0]).toBe(before)

    const renamed = [nodes[0]!, { ...nodes[1]!, data: defaultCardData({ title: 'Orders DB' }) }]
    const [after] = toCanvasEdges(edges, renamed)
    expect(after).not.toBe(before)
    expect(after?.ariaLabel).toBe('API to Orders DB, SQL')
  })
})
