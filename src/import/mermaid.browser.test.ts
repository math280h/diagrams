import { describe, expect, it } from 'vitest'
import { nodeLabel } from '@/model/labels'
import { cleanLabel, mermaidToDiagram, MermaidImportError, parseMermaidFlowchart, styleColor } from './mermaid'

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

  it('colours nodes and boundaries from classDef, class, ::: and style', async () => {
    const diagram = await mermaidToDiagram(
      `flowchart LR
  subgraph Team
    api[API]:::service --> db[(Orders DB)]
  end
  db --> mail[Email]
  classDef service fill:#9f9,stroke:#333
  class db store
  classDef store fill:#ececff,stroke:#d9534f
  style mail fill:#f9f
  style Team stroke:#f0ad4e`,
      'Shop',
    )
    const colors = Object.fromEntries(
      diagram.nodes.map((node) => [nodeLabel(node), node.type === 'text' ? null : node.data.color]),
    )
    expect(colors).toEqual({ Team: 'orange', API: 'green', 'Orders DB': 'red', Email: 'pink' })
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

describe('styleColor', () => {
  it('takes the fill colour, then the stroke colour, and a later declaration wins', () => {
    expect(styleColor(['fill:#f96'])).toBe('orange')
    expect(styleColor(['fill:#fff', 'stroke:#2a9d8f', 'stroke-width:2px'])).toBe('teal')
    expect(styleColor(['fill:#f96', 'fill:lightblue !important'])).toBe('blue')
    expect(styleColor(['fill:rgb(255 0 0 / 50%)'])).toBe('red')
  })

  it('reads greys, see-through fills and values that are not colours as neutral', () => {
    expect(styleColor([])).toBe('neutral')
    expect(styleColor(['fill:#333', 'stroke:#999'])).toBe('neutral')
    expect(styleColor(['fill:transparent', 'fill-opacity:0.5'])).toBe('neutral')
    expect(styleColor(['fill:none', 'stroke:url(#a)'])).toBe('neutral')
  })
})

describe('cleanLabel', () => {
  it('splits lines and removes markup', () => {
    expect(cleanLabel('Order service<br/>v2')).toEqual(['Order service', 'v2'])
    expect(cleanLabel('fa:fa-car Car #quot;fast#quot;')).toEqual(['Car "fast"'])
  })

  it('leaves no complete tag after one pass', () => {
    expect(cleanLabel('<scr<script>ipt>API</script>')).toEqual(['ipt>API'])
    expect(cleanLabel('a < b')).toEqual(['a < b'])
  })
})
