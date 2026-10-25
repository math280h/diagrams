import { describe, expect, it } from 'vitest'
import { cleanLabel, mermaidToDiagram, MermaidImportError, parseMermaidFlowchart } from './mermaid'

const SOURCE = `flowchart LR
  user([Shopper]) --> web[Web app]
  subgraph Services
    web --> orders[Order service<br/>v2]
    orders --> pay{Payment ok?}
  end
  pay -- yes --> db[(Orders DB)]
  pay -. no .-> mail[Email worker]
  orders ==> cache[(Redis)]`

describe('parseMermaidFlowchart', () => {
  it('reads nodes, groups, edges and the direction', async () => {
    const graph = await parseMermaidFlowchart(SOURCE)
    expect(graph.direction).toBe('RIGHT')
    const byId = new Map(graph.nodes.map((node) => [node.id, node]))
    expect(byId.get('Services')?.isGroup).toBe(true)
    expect(byId.get('orders')?.parentId).toBe('Services')
    expect(byId.get('pay')?.shape).toMatch(/diamond|question/)
    const dotted = graph.edges.find((edge) => edge.end === 'mail')
    expect(dotted?.stroke).toBe('dotted')
    expect(graph.edges.find((edge) => edge.end === 'db')?.label).toBe('yes')
  })

  it('rejects other diagram types', async () => {
    await expect(parseMermaidFlowchart('sequenceDiagram\n  A->>B: hi')).rejects.toThrow(MermaidImportError)
  })
})

describe('mermaidToDiagram', () => {
  it('names a cloud boundary without the provider and the kind', async () => {
    const diagram = await mermaidToDiagram(
      'flowchart LR\n  subgraph gcp [Google Cloud project rides-prod]\n    a[API]\n  end',
      'Rides',
    )
    const group = diagram.nodes.find((node) => node.type === 'group')
    expect(group?.type === 'group' && group.data).toMatchObject({ kind: 'gcp.project', label: 'rides-prod' })
  })

  it('gives each edge an orthogonal route from the layout', async () => {
    const diagram = await mermaidToDiagram(SOURCE, 'Shop')
    for (const edge of diagram.edges) {
      const route = edge.data.route ?? []
      expect(route.length).toBeGreaterThanOrEqual(2)
      for (let index = 1; index < route.length; index++) {
        const a = route[index - 1]!
        const b = route[index]!
        expect(a.x === b.x || a.y === b.y).toBe(true)
      }
    }
  })

  it('builds a laid out diagram', async () => {
    const diagram = await mermaidToDiagram(SOURCE, 'Shop')
    expect(diagram.name).toBe('Shop')
    expect(diagram.nodes.some((node) => node.type === 'group')).toBe(true)
    expect(diagram.nodes.find((node) => node.type === 'shape' && node.data.shape === 'diamond')).toBeTruthy()
    const database = diagram.nodes.find((node) => node.type === 'card' && node.data.title === 'Orders DB')
    expect(database?.type === 'card' && database.data.form).toBe('datastore')
    const positions = new Set(diagram.nodes.map((node) => `${node.position.x},${node.position.y}`))
    expect(positions.size).toBeGreaterThan(3)
    expect(diagram.edges).toHaveLength(6)
  })
})

describe('cleanLabel', () => {
  it('splits lines and removes markup', () => {
    expect(cleanLabel('Order service<br/>v2')).toEqual(['Order service', 'v2'])
    expect(cleanLabel('fa:fa-car Car #quot;fast#quot;')).toEqual(['Car "fast"'])
  })
})
