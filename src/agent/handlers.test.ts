import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { IconSet } from '@/canvas/icons/library'
import type { ToolContent } from '@/desktop/contract'
import { createDiagram } from '@/model/defaults'
import { absolutePosition } from '@/model/graph'
import { nodeLabel } from '@/model/labels'
import { stepBody } from '@/model/payload'
import { setRepository, repository } from '@/persistence/active-repository'
import { createCachedRepository } from '@/persistence/cached-repository'
import { useDoc } from '@/store/doc-store'
import { closeDiagramSession, openDiagram, openDiagramId, openDiagramSession } from '@/store/document'
import { resetHistory, undo, useHistory } from '@/store/history'
import { TEMPLATES } from '@/templates'
import { sampleTrace } from '@/import/trace-sample'
import type { HandlerContext } from './context'
import { HANDLERS } from './handlers'
import { runAgentTool } from './runtime'
import { TOOL_DEFINITIONS, TOOL_NAMES, type ToolInput, type ToolName } from './tool-definitions'

const LAMBDA = {
  id: 'aws:lambda',
  title: 'AWS Lambda',
  category: 'Compute',
  form: 'function' as const,
  aliases: ['lambda'],
  keywords: ['aws', 'lambda', 'function', 'serverless'],
}

const ICON_SETS: IconSet[] = [
  {
    source: 'aws',
    entries: [LAMBDA],
    art: {},
    byId: new Map([['aws:lambda', LAMBDA]]),
  },
  {
    source: 'logo',
    entries: [],
    art: {},
    byId: new Map([
      [
        'logo:postgresql',
        {
          id: 'logo:postgresql',
          title: 'PostgreSQL',
          category: 'Databases',
          form: 'datastore',
          aliases: [],
          keywords: [],
        },
      ],
    ]),
  },
]

let open: string | null = null

function context(): HandlerContext {
  return {
    signal: new AbortController().signal,
    toolTitle: 'Test tool',
    openDiagramId: () => open,
    async openInEditor(id) {
      const diagram = repository().load(id)
      if (!diagram) throw new Error(`missing ${id}`)
      if (useDoc.getState().id !== id) openDiagram(diagram)
      open = id
    },
    async goHome() {
      open = null
    },
    async layout(nodes, edges) {
      return {
        nodes: nodes.map((node, index) => (node.parentId ? node : { ...node, position: { x: index * 300, y: 0 } })),
        edges,
      }
    },
    iconSets: async () => ICON_SETS,
    lucideNames: async () => ['database', 'monitor', 'user', 'shopping-cart'],
    mermaidToDiagram: async (_source, name) => createDiagram(name ?? 'Imported'),
    renderPng: async () => ({ data: 'iVBORw0KGgo=', width: 20, height: 10, scale: 0.4 }),
    templates: TEMPLATES,
  }
}

async function call<N extends ToolName>(name: N, input: ToolInput<N>) {
  const handler = HANDLERS[name] as (input: ToolInput<N>, ctx: HandlerContext) => Promise<ToolContent[]>
  const content = await handler(input, context())
  const text = content.find((block) => block.type === 'text')
  return JSON.parse(text && text.type === 'text' ? text.text : '{}') as Record<string, unknown>
}

function nodeByLabel(label: string) {
  const node = useDoc.getState().nodes.find((candidate) => nodeLabel(candidate) === label)
  if (!node) throw new Error(`no node ${label}`)
  return node
}

beforeEach(() => {
  open = null
  setRepository(
    createCachedRepository({
      location: { kind: 'folder', path: '/test' },
      files: [],
      sink: { write: async () => undefined, remove: async () => undefined },
    }),
  )
  useDoc.setState({ id: null, nodes: [], edges: [], flows: [], name: '' })
  resetHistory()
})

describe('tool definitions', () => {
  it('converts every input schema to JSON Schema', () => {
    for (const name of TOOL_NAMES) {
      expect(() => z.toJSONSchema(TOOL_DEFINITIONS[name].input, { io: 'input' }), name).not.toThrow()
    }
  })

  it('has a handler for every tool', () => {
    expect(Object.keys(HANDLERS).toSorted()).toEqual([...TOOL_NAMES].toSorted())
  })

  it('names every template in the create_diagram description', () => {
    for (const template of TEMPLATES) expect(TOOL_DEFINITIONS.create_diagram.description).toContain(`"${template.id}"`)
  })
})

describe('agent tools', () => {
  it('creates a diagram and opens it', async () => {
    const result = await call('create_diagram', { name: 'Shop' })
    expect(open).toBe(result.diagramId)
    expect(useDoc.getState().name).toBe('Shop')
    expect((await call('list_diagrams', {})).diagrams).toEqual([
      expect.objectContaining({ id: result.diagramId, name: 'Shop', open: true }),
    ])
  })

  it('adds nodes, a boundary and edges in one undo step', async () => {
    await call('create_diagram', { name: 'Shop' })
    const result = await call('add_elements', {
      nodes: [
        { ref: 'vpc', kind: 'group', label: 'payments', boundary: 'aws.vpc' },
        { ref: 'api', label: 'Checkout API', icon: 'aws:lambda', parent: 'vpc' },
        { ref: 'db', label: 'Orders DB', icon: 'logo:postgresql', parent: 'vpc' },
        { ref: 'user', label: 'Shopper', form: 'client', icon: 'monitor' },
      ],
      edges: [
        { from: 'user', to: 'api', label: 'HTTPS' },
        { from: 'api', to: 'db', label: 'SQL' },
      ],
    })
    expect(result.warnings).toBeUndefined()
    const { nodes, edges } = useDoc.getState()
    expect(nodes).toHaveLength(4)
    expect(edges).toHaveLength(2)
    const api = nodeByLabel('Checkout API')
    expect(api.type === 'card' && api.data.form).toBe('function')
    expect(nodeByLabel('Orders DB').parentId).toBe(nodeByLabel('payments').id)

    const byId = new Map(nodes.map((node) => [node.id, node]))
    const group = nodeByLabel('payments')
    const inside = absolutePosition(api, byId)
    const groupAt = absolutePosition(group, byId)
    expect(inside.x).toBeGreaterThanOrEqual(groupAt.x)
    expect(inside.x + 216).toBeLessThanOrEqual(groupAt.x + group.width!)

    undo()
    expect(useDoc.getState().nodes).toHaveLength(0)
    expect(useHistory.getState().canUndo).toBe(false)
  })

  it('warns about icons and fields that do not exist', async () => {
    await call('create_diagram', { name: 'Shop' })
    const result = await call('add_elements', {
      nodes: [
        { label: 'Cache', icon: 'aws:nope' },
        { kind: 'text', label: 'Note', lines: ['x'] },
      ],
    })
    expect(result.warnings).toEqual([
      expect.stringContaining('"aws:nope" does not exist'),
      expect.stringContaining('"lines" does not apply to the text "Note"'),
    ])
    const cache = nodeByLabel('Cache')
    expect(cache.type === 'card' && cache.data.icon).toBe('')
  })

  it('colours cards, shapes and boundaries, reads the colours back and warns about text', async () => {
    await call('create_diagram', { name: 'Shop' })
    const added = await call('add_elements', {
      nodes: [
        { ref: 'team', kind: 'group', label: 'Payments', color: 'teal' },
        { ref: 'vpc', kind: 'group', label: 'shared', boundary: 'aws.vpc' },
        { label: 'API', color: 'green', parent: 'team' },
        { label: 'Orders DB', form: 'datastore', color: 'green', parent: 'team' },
        { kind: 'shape', label: 'Done', shape: 'pill', color: 'pink' },
        { kind: 'text', label: 'Note', color: 'red' },
        { label: 'Logs', color: 'auto' },
      ],
    })
    expect(added.warnings).toEqual([expect.stringContaining('"color" does not apply to the text "Note"')])
    const colorOf = (label: string) => {
      const node = nodeByLabel(label)
      return node.type === 'text' ? null : node.data.color
    }
    expect(['Payments', 'shared', 'API', 'Orders DB', 'Done', 'Logs'].map(colorOf)).toEqual([
      'teal',
      'auto',
      'green',
      'green',
      'pink',
      'neutral',
    ])

    await call('update_elements', {
      nodes: [
        { node: 'API', color: 'neutral' },
        { node: 'shared', color: 'orange' },
        { node: 'Payments', color: 'auto' },
      ],
    })
    expect(['API', 'shared', 'Payments'].map(colorOf)).toEqual(['neutral', 'orange', 'auto'])
    const read = await call('get_diagram', {})
    const colors = Object.fromEntries(
      (read.nodes as { label: string; color?: string }[]).map((node) => [node.label, node.color]),
    )
    expect(colors).toEqual({
      Payments: undefined,
      shared: 'orange',
      API: undefined,
      'Orders DB': 'green',
      Done: 'pink',
      Note: undefined,
      Logs: undefined,
    })
  })

  it('gives nodes an owner, a description and links, changes one of them and reads them back', async () => {
    await call('create_diagram', { name: 'Shop' })
    const added = await call('add_elements', {
      nodes: [
        {
          label: 'Orders',
          owner: 'Checkout team',
          description: 'Takes orders.',
          links: [{ label: 'Runbook', url: 'wiki.acme.dev/orders' }, { url: 'javascript:alert(1)' }],
        },
      ],
    })
    expect(added.warnings).toEqual([
      'The link "javascript:alert(1)" of "Orders" is not a web or mail address, so it was left out.',
    ])
    expect(nodeByLabel('Orders').data).toMatchObject({
      details: {
        owner: 'Checkout team',
        description: 'Takes orders.',
        links: [{ label: 'Runbook', url: 'wiki.acme.dev/orders' }],
      },
    })

    await call('update_elements', { nodes: [{ node: 'Orders', owner: 'Payments team' }] })
    expect(nodeByLabel('Orders').data).toMatchObject({
      details: { owner: 'Payments team', description: 'Takes orders.' },
    })
    const read = await call('get_diagram', { detail: 'full' })
    expect(read.nodes).toEqual([
      expect.objectContaining({
        label: 'Orders',
        owner: 'Payments team',
        description: 'Takes orders.',
        links: [{ label: 'Runbook', url: 'wiki.acme.dev/orders' }],
      }),
    ])
  })

  it('pins and unpins nodes and reports pinned nodes', async () => {
    await call('create_diagram', { name: 'Shop' })
    await call('add_elements', { nodes: [{ label: 'API', pinned: true }, { label: 'DB' }] })
    expect(nodeByLabel('API').data.pinned).toBe(true)
    const read = await call('get_diagram', {})
    expect(read.nodes).toEqual([
      expect.objectContaining({ label: 'API', pinned: true }),
      expect.not.objectContaining({ pinned: true }),
    ])
    await call('update_elements', { nodes: [{ node: 'API', pinned: false }] })
    expect(nodeByLabel('API').data.pinned).toBe(false)
  })

  it('links a card to the diagram of its inside, warns about a missing diagram and removes the link', async () => {
    const inside = await call('create_diagram', { name: 'Orders inside' })
    await call('create_diagram', { name: 'Shop' })
    const added = await call('add_elements', {
      nodes: [
        { label: 'Orders', opens: String(inside.diagramId) },
        { label: 'Ghost', opens: 'd_missing' },
      ],
    })
    expect(added.warnings).toEqual([
      'No diagram has the id "d_missing", so "Ghost" opens nothing. Find ids with list_diagrams.',
    ])
    expect(nodeByLabel('Orders').data).toMatchObject({ opens: inside.diagramId })
    expect((await call('get_diagram', {})).nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Orders', opens: inside.diagramId })]),
    )
    await call('update_elements', { nodes: [{ node: 'Orders', opens: null }] })
    expect(nodeByLabel('Orders').data).toMatchObject({ opens: '' })
  })

  it('places a new node next to the existing node it connects to', async () => {
    await call('create_diagram', { name: 'Shop' })
    await call('add_elements', { nodes: [{ label: 'API', x: 0, y: 0 }] })
    await call('add_elements', { nodes: [{ ref: 'db', label: 'DB' }], edges: [{ from: 'API', to: 'db' }] })
    const byId = new Map(useDoc.getState().nodes.map((node) => [node.id, node]))
    expect(absolutePosition(nodeByLabel('DB'), byId)).toEqual({ x: 336, y: 0 })
  })

  it('explains an ambiguous label and lists the candidates', async () => {
    await call('create_diagram', { name: 'Shop' })
    await call('add_elements', { nodes: [{ label: 'Worker' }, { label: 'Worker' }] })
    await expect(call('update_elements', { nodes: [{ node: 'worker', label: 'Job' }] })).rejects.toThrow(
      /"worker" matches 2 nodes: "Worker" \(n_\w+\), "Worker" \(n_\w+\)\. Use an id\./,
    )
  })

  it('suggests labels that contain the unknown name', async () => {
    await call('create_diagram', { name: 'Shop' })
    await call('add_elements', { nodes: [{ label: 'Payment service' }, { label: 'Orders DB' }] })
    await expect(call('update_elements', { nodes: [{ node: 'Payment', label: 'x' }] })).rejects.toThrow(
      /No node "Payment"\. Did you mean "Payment service" \(n_\w+\)\?/,
    )
  })

  it('places a node that moves into a group inside the group, and grows the group', async () => {
    await call('create_diagram', { name: 'Shop' })
    await call('add_elements', {
      nodes: [
        { kind: 'group', label: 'VPC', x: 0, y: 0, width: 300, height: 200 },
        { label: 'API', x: 900, y: 600 },
      ],
    })
    await call('update_elements', { nodes: [{ node: 'API', parent: 'VPC' }] })
    const result = await call('get_diagram', {})
    expect(result.warnings).toBeUndefined()
    const byId = new Map(useDoc.getState().nodes.map((node) => [node.id, node]))
    const at = absolutePosition(nodeByLabel('API'), byId)
    expect(at.x).toBeLessThan(300)
    expect(nodeByLabel('VPC').width).toBeGreaterThanOrEqual(at.x + 216)
  })

  it('keeps the nodes of an outer group in place when an inner group makes it grow to the left', async () => {
    await call('create_diagram', { name: 'Shop' })
    await call('add_elements', {
      nodes: [
        { ref: 'g', kind: 'group', label: 'Region', x: 0, y: 0, width: 800, height: 600 },
        { ref: 'h', kind: 'group', label: 'VPC', parent: 'g', x: 10, y: 60, width: 400, height: 300 },
        { label: 'Queue', parent: 'g', x: 480, y: 120 },
        { label: 'API', parent: 'h', x: 40, y: 120 },
      ],
    })
    const absoluteOf = () => {
      const byId = new Map(useDoc.getState().nodes.map((node) => [node.id, node]))
      return (label: string) => absolutePosition(nodeByLabel(label), byId)
    }
    const before = absoluteOf()
    const kept = { queue: before('Queue'), api: before('API'), vpc: before('VPC') }

    await call('add_elements', { nodes: [{ label: 'Worker', parent: 'VPC' }] })
    const after = absoluteOf()
    expect(after('Region').x).toBeLessThan(0)
    expect(after('Queue')).toEqual(kept.queue)
    expect(after('API')).toEqual(kept.api)
    const vpc = nodeByLabel('VPC')
    expect(after('VPC').x).toBeLessThanOrEqual(kept.vpc.x)
    expect(after('VPC').x + vpc.width!).toBe(kept.vpc.x + 400)
    expect(after('VPC').y).toBe(kept.vpc.y)
    const worker = after('Worker')
    expect(worker.x).toBeGreaterThan(after('VPC').x)
    expect(worker.y + 44).toBeLessThanOrEqual(after('VPC').y + vpc.height!)
  })

  it('keeps the width that the agent gives a new empty group and fills in the height', async () => {
    await call('create_diagram', { name: 'Shop' })
    await call('add_elements', { nodes: [{ kind: 'group', label: 'VPC', boundary: 'aws.vpc', width: 900 }] })
    expect(nodeByLabel('VPC').width).toBe(900)
    expect(nodeByLabel('VPC').height).toBe(336)
  })

  it('moves a node into a group at the position the agent gives', async () => {
    await call('create_diagram', { name: 'Shop' })
    await call('add_elements', {
      nodes: [
        { kind: 'group', label: 'VPC', x: 0, y: 0, width: 800, height: 400 },
        { label: 'API', x: 200, y: 160 },
      ],
    })
    await call('update_elements', { nodes: [{ node: 'API', parent: 'VPC', x: 200, y: 160 }] })
    const byId = new Map(useDoc.getState().nodes.map((node) => [node.id, node]))
    expect(nodeByLabel('API').parentId).toBe(nodeByLabel('VPC').id)
    expect(absolutePosition(nodeByLabel('API'), byId)).toEqual({ x: 200, y: 160 })
  })

  it('deletes a group with its nodes, or keeps the nodes when asked', async () => {
    await call('create_diagram', { name: 'Shop' })
    await call('add_elements', {
      nodes: [
        { ref: 'g', kind: 'group', label: 'VPC' },
        { label: 'API', parent: 'g' },
      ],
    })
    await call('delete_elements', { nodes: ['VPC'], keepChildren: true })
    expect(useDoc.getState().nodes.map((node) => node.id)).toEqual([nodeByLabel('API').id])
    expect(nodeByLabel('API').parentId).toBeUndefined()
  })

  it('adds a flow and fills in the edges between nodes', async () => {
    await call('create_diagram', { name: 'Shop' })
    await call('add_elements', {
      nodes: [
        { ref: 'a', label: 'Browser' },
        { ref: 'b', label: 'API' },
        { ref: 'c', label: 'DB' },
      ],
      edges: [
        { from: 'a', to: 'b', label: 'HTTPS' },
        { from: 'b', to: 'c', label: 'SQL' },
      ],
    })
    const result = await call('add_flow', {
      name: 'Order',
      steps: [
        { target: 'Browser', caption: 'The shopper pays.' },
        { target: 'DB', event: 'INSERT orders', latencyMs: 4 },
      ],
      token: { label: 'Order' },
    })
    const flow = useDoc.getState().flows[0]!
    expect(result.steps).toBe(4)
    expect(flow.steps.map((step) => step.target.kind)).toEqual(['node', 'edge', 'edge', 'node'])
    expect(flow.steps[3]).toMatchObject({ event: 'INSERT orders', latencyMs: 4 })
    expect(flow.token.label).toBe('Order')

    await call('update_flow', { flow: 'Order', steps: { remove: [1, 2], update: [{ index: 0, level: 'warn' }] } })
    expect(useDoc.getState().flows[0]!.steps.map((step) => step.level)).toEqual(['warn', 'info'])
  })

  it('makes a new diagram from a trace, with the trace as its flow', async () => {
    const result = await call('import_trace', { trace: sampleTrace() })
    expect(open).toBe(result.diagramId)
    expect(result).toMatchObject({ name: 'POST /orders', steps: 14, nodes: 7, edges: 6 })
    const flow = useDoc.getState().flows[0]!
    expect(flow.steps[4]).toMatchObject({ event: '429', level: 'warn' })
  })

  it('plays a trace on the cards of an existing diagram in one undo step', async () => {
    await call('create_diagram', { name: 'Shop', template: 'order-system' })
    const before = { nodes: useDoc.getState().nodes.length, flows: useDoc.getState().flows.length }
    const result = await call('import_trace', { trace: sampleTrace(), diagramId: useDoc.getState().id! })
    expect(result).toMatchObject({ steps: 14, matchedCards: 7, newCards: [], newEdges: 0 })
    expect(useDoc.getState().nodes).toHaveLength(before.nodes)
    expect(useDoc.getState().flows).toHaveLength(before.flows + 1)
    undo()
    expect(useDoc.getState().flows).toHaveLength(before.flows)
  })

  it('explains text that is not a trace', async () => {
    await expect(call('import_trace', { trace: '{"nodes": []}' })).rejects.toThrow('The file holds no spans.')
  })

  it('gives an edge request and response bodies from an example and from fields, and reads them back', async () => {
    await call('create_diagram', { name: 'Shop' })
    await call('add_elements', {
      nodes: [
        { ref: 'web', label: 'Browser' },
        { ref: 'api', label: 'API' },
      ],
      edges: [
        {
          from: 'web',
          to: 'api',
          label: 'POST /orders',
          request: { example: { items: [{ sku: 'LAMP-01', qty: 1 }] } },
        },
      ],
    })
    const data = () => useDoc.getState().edges[0]!.data!
    expect(data().request?.fields.map((field) => field.path)).toEqual(['items', 'items[].sku', 'items[].qty'])

    await call('update_elements', {
      edges: [
        {
          edge: 'Browser -> API',
          request: {
            fields: [
              { path: 'items[].sku', description: 'The product code' },
              { path: 'coupon', required: false },
            ],
            remove: ['items[].qty'],
          },
          response: {
            fields: [
              { path: 'orderId', example: 'ord_1' },
              { path: 'total', type: 'number', example: 49 },
            ],
          },
        },
      ],
    })
    expect(data().request?.fields.map((field) => [field.path, field.description, field.required])).toEqual([
      ['items', '', true],
      ['items[].sku', 'The product code', true],
      ['coupon', '', false],
    ])
    expect(stepBody(data(), true)).toBe('{"orderId":"ord_1","total":49}')

    const outline = (await call('get_diagram', {})) as { edges: Record<string, unknown>[] }
    expect(outline.edges[0]).toMatchObject({ request: { fields: 3 }, response: { fields: 2 } })
    const full = (await call('get_diagram', { detail: 'full' })) as { edges: Record<string, unknown>[] }
    expect(full.edges[0]?.request).toEqual({
      fields: [
        { path: 'items', type: 'array' },
        { path: 'items[].sku', type: 'string', example: 'LAMP-01', description: 'The product code' },
        { path: 'coupon', type: 'string', required: false },
      ],
    })

    await call('update_elements', { edges: [{ edge: 'Browser -> API', response: null }] })
    expect(data().response).toBeUndefined()
    expect(useDoc.getState().edges[0]!.data!.request).toBeDefined()
  })

  it('explains a body that it cannot build', async () => {
    await call('create_diagram', { name: 'Shop' })
    await call('add_elements', { nodes: [{ label: 'A' }, { label: 'B' }], edges: [{ from: 'A', to: 'B' }] })
    await expect(
      call('update_elements', { edges: [{ edge: 'A -> B', request: { example: 'text' } }] }),
    ).rejects.toThrow('The request example cannot be read.')
    await expect(
      call('update_elements', {
        edges: [{ edge: 'A -> B', request: { fields: [{ path: 'customer' }, { path: 'customer.email' }] } }],
      }),
    ).rejects.toThrow('"customer.email": “customer” is a string. Make it an object to hold this field.')
    await expect(call('update_elements', { edges: [{ edge: 'A -> B', request: {} }] })).rejects.toThrow(
      'Give an example, fields or paths to remove for the request body',
    )
    expect(useDoc.getState().edges[0]!.data!.request).toBeUndefined()
  })

  it('hides the bodies of a flow when asked', async () => {
    await call('create_diagram', { name: 'Shop' })
    await call('add_elements', { nodes: [{ label: 'API' }] })
    await call('add_flow', { name: 'Ping', steps: [{ target: 'API' }] })
    expect(useDoc.getState().flows[0]!.bodies).toBe(true)
    await call('update_flow', { flow: 'Ping', bodies: false })
    expect(useDoc.getState().flows[0]!.bodies).toBe(false)
  })

  it('reports flow steps that lost their node', async () => {
    await call('create_diagram', { name: 'Shop' })
    await call('add_elements', { nodes: [{ label: 'API' }] })
    await call('add_flow', { name: 'Ping', steps: [{ target: 'API' }] })
    const result = await call('delete_elements', { nodes: ['API'] })
    expect(result.warnings).toEqual([expect.stringContaining('The flow "Ping" has 1 steps')])
  })

  it('reads a diagram in a short form with warnings about overlaps', async () => {
    await call('create_diagram', { name: 'Shop' })
    await call('add_elements', {
      nodes: [
        { label: 'A', x: 0, y: 0 },
        { label: 'B', x: 100, y: 20 },
      ],
    })
    const diagram = await call('get_diagram', {})
    expect(diagram.nodes).toEqual([
      expect.objectContaining({ kind: 'card', label: 'A', x: 0, y: 0, form: 'service' }),
      expect.objectContaining({ kind: 'card', label: 'B', x: 100, y: 20 }),
    ])
    expect(diagram.warnings).toEqual([expect.stringContaining('overlaps')])
  })

  it('returns a rendered image and warns when the scale is low', async () => {
    await call('create_diagram', { name: 'Shop' })
    await call('add_elements', { nodes: [{ label: 'A' }] })
    const content = await HANDLERS.render_image({}, context())
    expect(content[0]).toEqual({ type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' })
    expect(content[1]?.type === 'text' && content[1].text).toContain('40 percent')
  })

  it('reads a provider name in an icon search as the icon set', async () => {
    const result = await call('search_icons', { query: 'amazon lambda' })
    expect(result.icons).toEqual([{ icon: 'aws:lambda', title: 'AWS Lambda', category: 'Compute', form: 'function' }])
  })

  it('tells the agent when no diagram is open', async () => {
    await expect(call('get_diagram', {})).rejects.toThrow('No diagram is open in the editor.')
  })
})

describe('runAgentTool', () => {
  it('validates the arguments before a handler runs', async () => {
    const outcome = await runAgentTool(
      'add_elements',
      { nodes: [{ kind: 'blob' }] },
      new AbortController().signal,
      context,
    )
    expect(outcome.ok).toBe(false)
    expect(!outcome.ok && outcome.message).toContain('kind')
  })

  it('refuses an unknown tool', async () => {
    const outcome = await runAgentTool('drop_tables', {}, new AbortController().signal, context)
    expect(outcome).toEqual({ ok: false, message: 'The app has no tool "drop_tables".' })
  })
})

describe('agent changes that end after the editor moved on', () => {
  function gatedContext(signal = new AbortController().signal) {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const state = { layoutCalls: 0 }
    const ctx: HandlerContext = {
      ...context(),
      signal,
      async layout(nodes, edges) {
        state.layoutCalls++
        await gate
        return { nodes, edges }
      },
    }
    return { ctx, release, state }
  }

  it('makes no change when the user leaves the editor while the tool runs', async () => {
    const { diagramId } = (await call('create_diagram', { name: 'Shop' })) as { diagramId: string }
    const { ctx, release, state } = gatedContext()
    const run = HANDLERS.add_elements({ nodes: [{ label: 'API' }, { label: 'DB' }] }, ctx)
    await vi.waitFor(() => expect(state.layoutCalls).toBe(1))
    open = null
    release()
    await expect(run).rejects.toThrow('The editor no longer shows this diagram')
    expect(useDoc.getState().nodes).toHaveLength(0)
    expect(repository().load(diagramId)?.nodes).toHaveLength(0)
  })

  it('makes no change after the client cancelled the call', async () => {
    await call('create_diagram', { name: 'Shop' })
    const controller = new AbortController()
    const { ctx, release, state } = gatedContext(controller.signal)
    const run = HANDLERS.add_elements({ nodes: [{ label: 'API' }, { label: 'DB' }] }, ctx)
    await vi.waitFor(() => expect(state.layoutCalls).toBe(1))
    controller.abort()
    release()
    await expect(run).rejects.toThrow('cancelled')
    expect(useDoc.getState().nodes).toHaveLength(0)
    expect(useHistory.getState().canUndo).toBe(false)
  })
})

describe('runAgentTool time limits', () => {
  it('answers at the time limit and starts the limit of the next call when the handler ends', async () => {
    await call('create_diagram', { name: 'Shop' })
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const slow = (signal: AbortSignal): HandlerContext => ({
      ...context(),
      signal,
      async layout(nodes, edges) {
        await gate
        return { nodes, edges }
      },
    })
    const first = await runAgentTool(
      'add_elements',
      { nodes: [{ label: 'API' }, { label: 'DB' }] },
      new AbortController().signal,
      slow,
      30,
    )
    expect(first).toEqual({ ok: false, message: 'The tool did not finish within 30 ms.' })

    const second = runAgentTool('get_editor_state', {}, new AbortController().signal, context, 30)
    await new Promise((resolve) => setTimeout(resolve, 60))
    release()
    expect((await second).ok).toBe(true)
    expect(useDoc.getState().nodes).toHaveLength(0)
  })
})

describe('changes that do not reach storage', () => {
  let failWrites = false
  const failing = (message: string) => async () => {
    if (failWrites) throw new Error(message)
  }

  function sessionContext(): HandlerContext {
    return {
      ...context(),
      async openInEditor(id) {
        const diagram = repository().load(id)
        if (!diagram) throw new Error(`missing ${id}`)
        if (openDiagramId() !== id) openDiagramSession(diagram)
        open = id
      },
    }
  }

  beforeEach(() => {
    failWrites = false
    setRepository(
      createCachedRepository({
        location: { kind: 'folder', path: '/test' },
        files: [],
        sink: { write: failing('disk full'), remove: failing('file in use') },
      }),
    )
  })

  afterEach(() => {
    const id = openDiagramId()
    if (id) closeDiagramSession(id, false)
  })

  it('tells the agent that a new diagram did not save', async () => {
    failWrites = true
    await expect(HANDLERS.create_diagram({ name: 'Shop' }, sessionContext())).rejects.toThrow(
      'The diagram could not be saved: disk full',
    )
  })

  it('tells the agent that a change did not save, and keeps the change in the editor', async () => {
    const ctx = sessionContext()
    await HANDLERS.create_diagram({ name: 'Shop' }, ctx)
    failWrites = true
    await expect(HANDLERS.add_elements({ nodes: [{ label: 'API' }] }, ctx)).rejects.toThrow(
      'The change shows in the editor, but it did not save: disk full',
    )
    expect(useDoc.getState().nodes).toHaveLength(1)
  })

  it('tells the agent that a diagram could not be deleted', async () => {
    const ctx = sessionContext()
    const [created] = await HANDLERS.create_diagram({ name: 'Shop' }, ctx)
    const { diagramId } = JSON.parse(created && created.type === 'text' ? created.text : '{}') as { diagramId: string }
    failWrites = true
    await expect(HANDLERS.delete_diagram({ diagramId }, ctx)).rejects.toThrow(
      'The diagram could not be deleted: file in use',
    )
  })
})
