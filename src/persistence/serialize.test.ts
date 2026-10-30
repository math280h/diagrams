import { describe, expect, it } from 'vitest'
import {
  createDiagram,
  createEdge,
  createFlow,
  defaultCardData,
  defaultGroupData,
  defaultShapeData,
  defaultTextData,
} from '@/model/defaults'
import { DIAGRAM_VERSION, diagramSchema } from '@/model/schema'
import { TEMPLATES, templateDiagrams } from '@/templates'
import { DiagramFormatError, migrate, migrateElements } from './migrations'
import { fromDiagram, toDiagram } from './serialize'

describe('templates', () => {
  it.each(TEMPLATES.map((template) => [template.name, template] as const))('%s matches the schema', (_, template) => {
    for (const diagram of templateDiagrams(template)) expect(() => diagramSchema.parse(diagram)).not.toThrow()
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

  it('rejects a newer version and asks the user to update', () => {
    expect(() => migrate({ ...createDiagram(), version: DIAGRAM_VERSION + 1 })).toThrow(
      `This diagram uses format ${DIAGRAM_VERSION + 1} from a newer version of Diagrams. This version reads format ${DIAGRAM_VERSION} and older. Update Diagrams to open it.`,
    )
  })

  it('brings copied nodes and edges of an earlier format to the current format', () => {
    const { color: _color, ...card } = defaultCardData({ title: 'API' })
    const edge = createEdge('api', 'api')
    const nodes = [{ id: 'api', type: 'card', position: { x: 0, y: 0 }, data: { ...card, accent: 'violet' } }]
    const edges = [{ ...edge, data: { ...edge.data, accent: 'blue' } }]
    const migrated = migrateElements(JSON.parse(JSON.stringify(nodes)), JSON.parse(JSON.stringify(edges)), 7)
    expect(migrated.nodes[0]!.data).toMatchObject({ title: 'API', color: 'neutral' })
    expect(migrated.nodes[0]!.data).not.toHaveProperty('accent')
    expect(migrated.edges[0]!.data).not.toHaveProperty('accent')
    expect(() => migrateElements(nodes, edges, DIAGRAM_VERSION + 1)).toThrow(/^The copied nodes use format/)
    expect(() => migrateElements('nodes', [], DIAGRAM_VERSION)).toThrow(DiagramFormatError)
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

  it('gives the flows of version 13 diagrams the framing camera with the gentle motion, and keeps set values', () => {
    const { cameraStyle: _style, cameraMotion: _motion, ...flow } = createFlow('Checkout')
    const set = { ...flow, id: 'set', cameraStyle: 'follow', cameraMotion: 'quick' }
    const v13 = { ...createDiagram(), version: 13, flows: [flow, set] }
    const migrated = migrate(JSON.parse(JSON.stringify(v13)))
    expect(migrated.flows.map(({ cameraStyle, cameraMotion }) => [cameraStyle, cameraMotion])).toEqual([
      ['frame', 'gentle'],
      ['follow', 'quick'],
    ])
  })

  it('keeps the layout routes of version 15 edges, and does not route them around nodes', () => {
    const edge = createEdge('a', 'b', { label: 'SQL' })
    const route = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
    ]
    const { routeAround: _routeAround, ...theme } = createDiagram().theme
    const v15 = { ...createDiagram(), version: 15, theme, edges: [{ ...edge, data: { ...edge.data, route } }] }
    const migrated = migrate(JSON.parse(JSON.stringify(v15)))
    expect(migrated.theme.routeAround).toBe(false)
    expect(migrated.edges[0]!.data?.route).toEqual(route)
  })

  it('turns off the step numbers of version 14 flows', () => {
    const { stepNumbers: _numbers, ...flow } = createFlow('Checkout')
    const v14 = { ...createDiagram(), version: 14, flows: [flow] }
    expect(migrate(JSON.parse(JSON.stringify(v14))).flows[0]!.stepNumbers).toBe(false)
  })

  it('reads version 10 diagrams as they are, and keeps the inside links of version 11', () => {
    const base = createDiagram()
    const node = { id: 'api', type: 'card', position: { x: 0, y: 0 }, data: defaultCardData() }
    expect(
      migrate(JSON.parse(JSON.stringify({ ...base, version: 10, nodes: [node] }))).nodes[0]!.data,
    ).not.toHaveProperty('opens')
    const v11 = { ...base, nodes: [{ ...node, data: { ...node.data, opens: 'd_inside' } }] }
    expect(migrate(JSON.parse(JSON.stringify(v11))).nodes[0]!.data).toMatchObject({ opens: 'd_inside' })
  })

  it('reads version 9 diagrams as they are, and keeps the pins of version 10', () => {
    const base = createDiagram()
    const node = { id: 'api', type: 'card', position: { x: 0, y: 0 }, data: defaultCardData() }
    const v9 = { ...base, version: 9, nodes: [node] }
    expect(migrate(JSON.parse(JSON.stringify(v9))).nodes[0]!.data).not.toHaveProperty('pinned')
    const v10 = { ...base, nodes: [{ ...node, data: { ...node.data, pinned: true } }] }
    expect(migrate(JSON.parse(JSON.stringify(v10))).nodes[0]!.data).toMatchObject({ pinned: true })
  })

  it('gives version 8 cards, shapes and boundaries empty details, and keeps details that a node already has', () => {
    const base = createDiagram()
    const node = (id: string, type: string, data: object) => ({ id, type, position: { x: 0, y: 0 }, data })
    const { details: _card, ...card } = defaultCardData()
    const { details: _shape, ...shape } = defaultShapeData()
    const { details: _group, ...group } = defaultGroupData()
    const kept = {
      description: 'Owns checkout.',
      owner: 'Payments',
      links: [{ id: 'k1', label: '', url: 'https://x.dev' }],
    }
    const v8 = {
      ...base,
      version: 8,
      nodes: [
        node('api', 'card', card),
        node('start', 'shape', shape),
        node('vpc', 'group', group),
        node('note', 'text', defaultTextData()),
        node('db', 'card', { ...card, details: kept }),
      ],
    }
    const migrated = migrate(JSON.parse(JSON.stringify(v8)))
    const empty = { description: '', owner: '', links: [] }
    const [api, start, vpc, note, db] = migrated.nodes
    expect(api!.data).toMatchObject({ details: empty })
    expect(start!.data).toMatchObject({ details: empty })
    expect(vpc!.data).toMatchObject({ details: empty })
    expect(note!.data).not.toHaveProperty('details')
    expect(db!.data).toMatchObject({ details: kept })
  })

  it('gives version 7 cards and shapes the neutral colour, and drops the accents that the canvas did not draw', () => {
    const base = createDiagram()
    const node = (id: string, type: string, data: Record<string, unknown>) => ({
      id,
      type,
      position: { x: 0, y: 0 },
      data: { ...data, accent: 'violet' },
    })
    const { color: _cardColor, ...card } = defaultCardData()
    const { color: _shapeColor, ...shape } = defaultShapeData()
    const edge = createEdge('api', 'db')
    const flow = createFlow('Checkout')
    const v7 = {
      ...base,
      version: 7,
      nodes: [
        node('api', 'card', card),
        node('start', 'shape', shape),
        node('note', 'text', { ...defaultTextData(), tone: 'accent' }),
        node('vpc', 'group', defaultGroupData()),
      ],
      edges: [{ ...edge, data: { ...edge.data, accent: 'blue' } }],
      flows: [{ ...flow, token: { ...flow.token, accent: 'violet' } }],
    }
    const migrated = migrate(JSON.parse(JSON.stringify(v7)))
    const [api, start, note, vpc] = migrated.nodes
    expect(api!.data).toMatchObject({ color: 'neutral' })
    expect(start!.data).toMatchObject({ color: 'neutral' })
    expect(note!.data).toMatchObject({ tone: 'muted' })
    expect(vpc!.data).toMatchObject({ color: 'auto' })
    for (const value of [
      ...migrated.nodes.map((item) => item.data),
      migrated.edges[0]!.data,
      migrated.flows[0]!.token,
    ]) {
      expect(value).not.toHaveProperty('accent')
    }
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
