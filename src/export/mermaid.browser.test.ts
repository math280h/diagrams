import { describe, expect, it } from 'vitest'
import { mermaidToDiagram, parseMermaidFlowchart } from '@/import/mermaid'
import { nodeLabel } from '@/model/labels'
import { fromDiagram } from '@/persistence/serialize'
import { TEMPLATES } from '@/templates'
import { DiagramBuilder } from '@/templates/builder'
import { diagramToMermaid } from './mermaid'

async function render(id: string, text: string) {
  const { default: mermaid } = await import('mermaid')
  mermaid.initialize({ startOnLoad: false })
  return mermaid.render(id, text)
}

describe('diagramToMermaid with Mermaid', () => {
  it.each(TEMPLATES.map((template) => [template.name, template] as const))(
    'writes %s so that Mermaid draws it and the import reads it back',
    async (_name, template) => {
      const diagram = template.build()
      const text = diagramToMermaid(fromDiagram(diagram))
      const kept = diagram.nodes.filter((node) => node.type !== 'text')
      const keptIds = new Set(kept.map((node) => node.id))
      const edges = diagram.edges.filter((edge) => keptIds.has(edge.source) && keptIds.has(edge.target))

      const graph = await parseMermaidFlowchart(text)
      expect(graph.nodes).toHaveLength(kept.length)
      expect(graph.edges).toHaveLength(edges.length)
      expect((await render(`export-${template.id}`, text)).svg).toContain('<svg')

      const imported = await mermaidToDiagram(text)
      const labels = (nodes: typeof diagram.nodes) =>
        nodes
          .filter((node) => node.type === 'card' || node.type === 'shape')
          .map((node) => nodeLabel(node).replace(/\s+/g, ' '))
          .toSorted()
      expect(labels(imported.nodes)).toEqual(labels(kept))
      const boundaries = (nodes: typeof diagram.nodes) =>
        nodes.flatMap((node) => (node.type === 'group' ? [`${node.data.kind} ${node.data.label}`] : [])).toSorted()
      expect(boundaries(imported.nodes)).toEqual(boundaries(kept))
      expect(imported.edges.map((edge) => edge.data.label).toSorted()).toEqual(
        edges.map((edge) => edge.data.label).toSorted(),
      )
    },
  )

  it('writes ids, labels and markers that Mermaid reads as they are', async () => {
    const builder = new DiagramBuilder()
    const ops = builder.card(0, 0, { title: 'ops' })
    const xray = builder.card(300, 0, { title: 'x-ray' })
    const end = builder.card(600, 0, { title: 'end' })
    builder.group(900, 0, 300, 200, { label: 'Empty' })
    builder.edge(ops, xray, { label: 'a | b "quoted"' })
    builder.edge(xray, end, { markerStart: 'dot', markerEnd: 'dot', stroke: 'dashed' })
    builder.edge(end, ops, { markerStart: 'arrow', markerEnd: 'dot' })
    const text = diagramToMermaid(builder)

    const graph = await parseMermaidFlowchart(text)
    expect(graph.nodes.map((node) => node.label).toSorted()).toEqual(['Empty', 'end', 'ops', 'x-ray'])
    expect(graph.edges.map((edge) => [edge.start, edge.end])).toEqual([
      ['ops', 'x_ray'],
      ['x_ray', 'node_end'],
      ['node_end', 'ops'],
    ])
    expect(graph.edges[0]?.label).toContain('a | b')
    expect(graph.edges[1]).toMatchObject({ stroke: 'dotted' })
    expect(graph.edges[1]?.arrowTypeStart).toContain('circle')
    expect(graph.edges[1]?.arrowTypeEnd).toContain('circle')
    expect(graph.edges[2]?.arrowTypeStart).toBe('none')
    expect(graph.edges[2]?.arrowTypeEnd).toContain('circle')
    expect((await render('export-tricky', text)).svg).toContain('<svg')
  })

  it('writes colours that Mermaid draws and the import reads back', async () => {
    const builder = new DiagramBuilder()
    const team = builder.group(0, 0, 900, 300, { label: 'Payments', color: 'orange' })
    const api = builder.card(32, 56, { title: 'API', color: 'blue' }, 216, team)
    const db = builder.card(400, 56, { title: 'Orders DB', form: 'datastore', color: 'yellow' }, 216, team)
    const check = builder.shape(700, 56, 136, 136, { shape: 'diamond', label: 'Paid?', color: 'red' })
    const logs = builder.card(32, 456, { title: 'Logs' })
    builder.edge(api, db)
    builder.edge(db, check)
    builder.edge(check, logs)
    const text = diagramToMermaid(builder)

    const { svg } = await render('export-colors', text)
    expect(svg).toContain('stroke:#5297b9')
    const imported = await mermaidToDiagram(text)
    const colors = Object.fromEntries(
      imported.nodes.map((node) => [nodeLabel(node), node.type === 'text' ? null : node.data.color]),
    )
    expect(colors).toEqual({ Payments: 'orange', API: 'blue', 'Orders DB': 'yellow', 'Paid?': 'red', Logs: 'neutral' })
  })
})
