import { describe, expect, it } from 'vitest'
import { DiagramBuilder } from '@/templates/builder'
import { diagramToMermaid } from './mermaid'

describe('diagramToMermaid', () => {
  it('writes cards, shapes and nested boundaries in the order of the edges', () => {
    const builder = new DiagramBuilder()
    const vpc = builder.group(200, 0, 600, 300, { kind: 'aws.vpc', label: 'payments', detail: '10.0.0.0/16' })
    const subnet = builder.group(32, 56, 300, 200, { label: 'Private', parentId: vpc })
    const db = builder.card(900, 100, { title: 'Orders DB', form: 'datastore' })
    const user = builder.card(0, 100, { title: 'Shopper', form: 'client' })
    const api = builder.card(32, 56, { title: 'API gateway', lines: ['Envoy · {3} replicas'] }, 216, subnet)
    const paid = builder.shape(600, 100, 136, 136, { shape: 'diamond', label: 'Paid?' })
    const note = builder.text(0, 400, { text: 'A note' })
    builder.edge(user, api, { label: 'HTTPS' })
    builder.edge(api, paid)
    builder.edge(paid, db, { stroke: 'dashed', label: 'yes' })
    builder.edge(note, db)

    expect(diagramToMermaid(builder)).toBe(`flowchart LR
    shopper["Shopper"]
    subgraph payments["AWS VPC payments<br/>10.0.0.0/16"]
        subgraph private["Private"]
            api_gateway["API gateway<br/>Envoy · 3 replicas"]
        end
    end
    paid{"Paid?"}
    orders_db[("Orders DB")]
    shopper -->|"HTTPS"| api_gateway
    api_gateway --> paid
    paid -.->|"yes"| orders_db
`)
  })

  it('runs top to bottom when the edges run mostly down', () => {
    const builder = new DiagramBuilder()
    const web = builder.card(0, 0, { title: 'Web' })
    const api = builder.card(40, 300, { title: 'API' })
    builder.edge(web, api)
    expect(diagramToMermaid(builder).split('\n')[0]).toBe('flowchart TD')
  })

  it('writes the line style and the markers of each edge', () => {
    const builder = new DiagramBuilder()
    const a = builder.card(0, 0, { title: 'A' })
    const b = builder.card(400, 0, { title: 'B' })
    builder.edge(a, b, { width: 2.25 })
    builder.edge(a, b, { markerEnd: 'none' })
    builder.edge(a, b, { markerStart: 'arrow' })
    builder.edge(a, b, { markerEnd: 'dot', stroke: 'dotted' })
    builder.edge(a, b, { markerStart: 'dot', markerEnd: 'dot', stroke: 'dashed' })
    builder.edge(a, b, { markerStart: 'arrow', markerEnd: 'dot' })
    builder.edge(a, b, { markerStart: 'dot', markerEnd: 'none', width: 3 })
    expect(diagramToMermaid(builder).split('\n').slice(3, -1)).toEqual([
      '    a ==> b',
      '    a --- b',
      '    a <--> b',
      '    a -.-o b',
      '    a o-.-o b',
      '    a --o b',
      '    b ==o a',
    ])
  })

  it('gives each node a readable id that Mermaid cannot read as syntax', () => {
    const builder = new DiagramBuilder()
    for (const [index, title] of ['Orders', 'Orders', 'end', '3 tier', '', '注文', 'Café'].entries()) {
      builder.card(index * 300, 0, { title })
    }
    const ids = diagramToMermaid(builder)
      .split('\n')
      .slice(1, -1)
      .map((line) => line.trim().split('[')[0])
    expect(ids).toEqual(['orders', 'orders_2', 'node_end', 'node_3_tier', 'untitled_node', 'node', 'cafe'])
  })

  it('escapes quotes and HTML in labels, and writes line breaks', () => {
    const builder = new DiagramBuilder()
    builder.card(0, 0, { title: 'Say "hi" <b>' })
    builder.shape(300, 0, 172, 56, { shape: 'pill', label: 'Line 1\nLine 2' })
    expect(diagramToMermaid(builder).split('\n').slice(1, 3)).toEqual([
      '    say_hi_b["Say #quot;hi#quot; #lt;b#gt;"]',
      '    line_1(["Line 1<br/>Line 2"])',
    ])
  })

  it('writes the colours of cards, shapes and boundaries as classes', () => {
    const builder = new DiagramBuilder()
    const team = builder.group(0, 0, 900, 300, { label: 'Payments', color: 'teal' })
    builder.group(0, 400, 600, 200, { kind: 'aws.vpc', label: 'shared' })
    const api = builder.card(32, 56, { title: 'API', color: 'green' }, 216, team)
    const db = builder.card(400, 56, { title: 'Orders DB', form: 'datastore', color: 'green' }, 216, team)
    const done = builder.shape(700, 56, 136, 56, { shape: 'pill', label: 'Done', color: 'pink' }, team)
    builder.card(32, 456, { title: 'Logs' })
    builder.edge(api, db)
    builder.edge(db, done)

    expect(diagramToMermaid(builder).split('\n').slice(-7, -1)).toEqual([
      '    classDef green stroke:#34a65c,stroke-width:2px',
      '    class api,orders_db green',
      '    classDef teal stroke:#23a5a6,stroke-width:2px',
      '    class payments teal',
      '    classDef pink stroke:#cd659b,stroke-width:2px',
      '    class done pink',
    ])
  })

  it('writes only the header for an empty diagram', () => {
    expect(diagramToMermaid({ nodes: [], edges: [] })).toBe('flowchart LR\n')
  })
})
