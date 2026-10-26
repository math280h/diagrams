import { describe, expect, it } from 'vitest'
import { createDiagram, createEdge, createFlow } from '@/model/defaults'
import { DIAGRAM_VERSION, diagramSchema } from '@/model/schema'
import { TEMPLATES } from '@/templates'
import { DiagramFormatError, migrate } from './migrations'
import { fromDiagram, toDiagram } from './serialize'

describe('templates', () => {
  it.each(TEMPLATES.map((template) => [template.name, template] as const))('%s matches the schema', (_, template) => {
    expect(() => diagramSchema.parse(template.build())).not.toThrow()
  })
})

describe('serialize', () => {
  it('round-trips a diagram without change', () => {
    const diagram = TEMPLATES[0]!.build()
    const { nodes, edges } = fromDiagram(diagram)
    const again = toDiagram({ ...diagram, nodes, edges })
    expect({ ...again, updatedAt: 0 }).toEqual({ ...diagram, updatedAt: 0 })
  })

  it('does not store runtime flags', () => {
    const diagram = TEMPLATES[0]!.build()
    const { nodes, edges } = fromDiagram(diagram)
    const stored = toDiagram({
      ...diagram,
      nodes: nodes.map((node) => ({ ...node, selected: true, dragging: true })),
      edges: edges.map((edge) => ({ ...edge, selected: true })),
    })
    expect(JSON.stringify(stored)).not.toMatch(/"selected"|"dragging"/)
  })

  it('puts parent nodes before their children', () => {
    const diagram = TEMPLATES[1]!.build()
    const reversed = { ...diagram, nodes: [...diagram.nodes].reverse() }
    const { nodes } = fromDiagram(reversed)
    const index = new Map(nodes.map((node, i) => [node.id, i]))
    for (const node of nodes) {
      if (node.parentId) expect(index.get(node.parentId)!).toBeLessThan(index.get(node.id)!)
    }
  })
})

describe('migrate', () => {
  it('accepts the current version', () => {
    const diagram = createDiagram('Test')
    expect(migrate(JSON.parse(JSON.stringify(diagram)))).toEqual(diagram)
  })

  it('rejects a newer version', () => {
    expect(() => migrate({ ...createDiagram(), version: DIAGRAM_VERSION + 1 })).toThrow(DiagramFormatError)
  })

  it('rejects data that is not a diagram', () => {
    expect(() => migrate('hello')).toThrow(DiagramFormatError)
    expect(() => migrate({ version: 1, nodes: 'x' })).toThrow(DiagramFormatError)
  })

  it('gives version 1 cards a form from their icon and drops the card variant', () => {
    const card = (id: string, icon: string) => ({
      id,
      type: 'card',
      position: { x: 0, y: 0 },
      data: {
        title: id,
        icon,
        accent: 'neutral',
        lines: [],
        meter: null,
        meterText: '',
        status: 'none',
        badge: '',
        variant: 'glass',
      },
    })
    const base = createDiagram()
    const v1 = {
      ...base,
      version: 1,
      theme: { ...base.theme, fonts: 'geist' },
      nodes: [card('db', 'database'), card('api', 'server')],
    }
    const migrated = migrate(JSON.parse(JSON.stringify(v1)))
    const forms = migrated.nodes.map((node) => (node.type === 'card' ? node.data.form : null))
    expect(forms).toEqual(['datastore', 'service'])
    expect(migrated.nodes[0]!.data).not.toHaveProperty('variant')
    expect(migrated.theme.fonts).toBe('host')
  })

  it('gives version 3 flow steps an empty event, no latency and the info level', () => {
    const base = createDiagram()
    const step = {
      id: 's1',
      target: { kind: 'node', id: 'n1' },
      caption: '',
      durationMs: 1000,
      camera: 'follow',
      zoom: 1,
    }
    const flow = { ...createFlow('Login'), steps: [step] }
    const v3 = { ...base, version: 3, flows: [flow] }
    const migrated = migrate(JSON.parse(JSON.stringify(v3)))
    expect(migrated.flows[0]!.steps[0]).toMatchObject({ event: '', latencyMs: null, level: 'info' })
  })

  it('moves version 5 diagrams to the Host Grotesk pair and protocol colours', () => {
    const base = createDiagram()
    const { protocolColors: _protocolColors, ...theme } = base.theme
    const edge = createEdge('a', 'b', { label: 'gRPC' })
    const { protocol: _protocol, ...edgeData } = edge.data!
    const v5 = { ...base, version: 5, theme: { ...theme, fonts: 'atkinson' }, edges: [{ ...edge, data: edgeData }] }
    const migrated = migrate(JSON.parse(JSON.stringify(v5)))
    expect(migrated.theme).toMatchObject({ fonts: 'host', protocolColors: true })
    expect(migrated.edges[0]!.data.protocol).toBe('auto')
    const plex = { ...base, version: 5, theme: { ...base.theme, fonts: 'plex' } }
    expect(migrate(JSON.parse(JSON.stringify(plex))).theme.fonts).toBe('plex')
  })

  it('shows the bodies in the flows of version 6 diagrams, and keeps edges without bodies', () => {
    const base = createDiagram()
    const { bodies: _bodies, ...flow } = createFlow('Checkout')
    const v6 = { ...base, version: 6, flows: [flow], edges: [createEdge('a', 'b', { label: 'HTTPS' })] }
    const migrated = migrate(JSON.parse(JSON.stringify(v6)))
    expect(migrated.flows[0]!.bodies).toBe(true)
    expect(migrated.edges[0]!.data.request).toBeUndefined()
  })

  it('gives version 4 groups the custom kind and turns on boundary colors', () => {
    const base = createDiagram()
    const group = {
      id: 'g1',
      type: 'group',
      position: { x: 0, y: 0 },
      width: 300,
      height: 200,
      data: { label: 'Zone', icon: '', accent: 'neutral', border: 'dashed', tint: true },
    }
    const { boundaryColors: _colors, ...theme } = base.theme
    const v4 = { ...base, version: 4, theme, nodes: [group] }
    const migrated = migrate(JSON.parse(JSON.stringify(v4)))
    expect(migrated.nodes[0]!.data).toMatchObject({ kind: 'custom', detail: '', color: 'auto', label: 'Zone' })
    expect(migrated.theme.boundaryColors).toBe(true)
  })
})
