import { describe, expect, it } from 'vitest'
import { fromDiagram } from '@/persistence/serialize'
import { TEMPLATES } from '@/templates'
import { DiagramBuilder, edgeStep, nodeStep } from '@/templates/builder'
import { flowToMermaidSequence } from './sequence'

describe('flowToMermaidSequence with Mermaid', () => {
  const flows = TEMPLATES.flatMap((template) => {
    const diagram = template.build()
    return diagram.flows.map((flow) => [`${template.name}: ${flow.name}`, diagram, flow] as const)
  })

  it.each(flows)('writes %s so that Mermaid draws it', async (_name, diagram, flow) => {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({ startOnLoad: false })
    const text = flowToMermaidSequence(flow, fromDiagram(diagram))
    const parsed = await mermaid.mermaidAPI.getDiagramFromText(text)
    expect(parsed.type).toBe('sequence')
    const id = `sequence-${flow.id}`
    expect((await mermaid.render(id, text)).svg).toContain('<svg')
  })

  it('keeps text with Mermaid syntax and failed replies drawable', async () => {
    const b = new DiagramBuilder()
    const a = b.card(0, 0, { title: 'end' })
    const c = b.card(300, 0, { title: 'Queue #1; <main>' })
    const edge = b.edge(a, c, { label: 'publish' })
    b.flow('Send #2; retry', [
      nodeStep(a, 'Line one\nline two; with <tags>', 1300, 'fit', 1, { event: 'start # here' }),
      edgeStep(edge, 'A caption.', 1200, 'follow', 1, { latencyMs: 3 }),
      edgeStep(edge, '', 1200, 'follow', 1, { event: 'nack', level: 'error' }),
    ])
    const diagram = b.build('Edge cases')
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({ startOnLoad: false })
    const text = flowToMermaidSequence(diagram.flows[0]!, fromDiagram(diagram))
    const { svg } = await mermaid.render('sequence-edge-cases', text)
    expect(svg).toContain('Queue #1; &lt;main&gt;')
  })
})
