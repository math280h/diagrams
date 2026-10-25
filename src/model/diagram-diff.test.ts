import { describe, expect, it } from 'vitest'
import { DiagramBuilder } from '@/templates/builder'
import { describeChange, describeContent } from './diagram-diff'
import type { Diagram } from './schema'

function base() {
  const b = new DiagramBuilder()
  const api = b.card(0, 0, { title: 'API' })
  const db = b.card(300, 0, { title: 'Orders DB', form: 'datastore' })
  b.edge(api, db, { label: 'SQL' })
  return { diagram: b.build('Shop'), api, db }
}

function edit(diagram: Diagram, change: (copy: Diagram) => void): Diagram {
  const copy = structuredClone(diagram)
  change(copy)
  return copy
}

describe('describeChange', () => {
  it('names added nodes and counts connections', () => {
    const { diagram, api } = base()
    const b = new DiagramBuilder()
    const redis = b.card(0, 200, { title: 'Redis' })
    b.edge(api, redis)
    const after = edit(diagram, (copy) => {
      copy.nodes.push(...b.build('x').nodes)
      copy.edges.push(...b.build('x').edges)
    })
    expect(describeChange(diagram, after)).toBe('Added Redis and a connection.')
  })

  it('tells a move apart from a change of content', () => {
    const { diagram, api, db } = base()
    const after = edit(diagram, (copy) => {
      copy.nodes.find((node) => node.id === api)!.position.x += 40
      const card = copy.nodes.find((node) => node.id === db)!
      if (card.type === 'card') card.data.title = 'Orders'
    })
    expect(describeChange(diagram, after)).toBe('Changed Orders. Moved API.')
  })

  it('counts nodes instead of naming them when many change', () => {
    const { diagram } = base()
    const b = new DiagramBuilder()
    for (const title of ['A', 'B', 'C', 'D']) b.card(0, 0, { title })
    const after = edit(diagram, (copy) => copy.nodes.push(...b.build('x').nodes))
    expect(describeChange(diagram, after)).toBe('Added 4 nodes.')
  })

  it('reports removals, a rename and a style change', () => {
    const { diagram, db } = base()
    const after = edit(diagram, (copy) => {
      copy.nodes = copy.nodes.filter((node) => node.id !== db)
      copy.edges = []
      copy.name = 'Store'
      copy.theme.mode = 'light'
    })
    expect(describeChange(diagram, after)).toBe(
      'Removed Orders DB and a connection. Renamed the diagram to “Store”. Changed the style.',
    )
  })

  it('ignores measured sizes', () => {
    const { diagram, api } = base()
    const after = edit(diagram, (copy) => {
      copy.nodes.find((node) => node.id === api)!.measured = { width: 216, height: 60 }
    })
    expect(describeChange(diagram, after)).toBe('No visible changes.')
  })
})

describe('describeContent', () => {
  it('counts nodes, connections and flows', () => {
    expect(describeContent(base().diagram)).toBe('2 nodes and 1 connection')
  })
})
