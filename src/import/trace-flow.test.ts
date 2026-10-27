import { describe, expect, it } from 'vitest'
import { compileFlow } from '@/engine/flow/compile'
import { nodeLabel } from '@/model/labels'
import type { CardNodeType, DiagramEdge, DiagramNode } from '@/model/types'
import { fromDiagram } from '@/persistence/serialize'
import { TEMPLATES } from '@/templates'
import { parseTraces, walkTrace } from './trace'
import { matchKey, planTraceFlow } from './trace-flow'
import { sampleTrace } from './trace-sample'

const walk = () => walkTrace(parseTraces(sampleTrace())[0]!)

function orderSystem() {
  return fromDiagram(TEMPLATES.find((template) => template.id === 'order-system')!.build())
}

function label(id: string, nodes: readonly DiagramNode[]) {
  return nodeLabel(nodes.find((node) => node.id === id)!)
}

function hops(plan: ReturnType<typeof planTraceFlow>, nodes: DiagramNode[], edges: DiagramEdge[]) {
  const all = [...nodes, ...plan.nodes]
  const timeline = compileFlow(plan.flow, new Set(all.map((node) => node.id)), [...edges, ...plan.edges])
  return timeline.segments.map((segment) =>
    segment.step.target.kind === 'node'
      ? label(segment.toNode!, all)
      : `${label(segment.fromNode!, all)} -> ${label(segment.toNode!, all)}`,
  )
}

describe('matchKey', () => {
  it('gives service names and card titles of one service the same key', () => {
    for (const name of ['Order service', 'orders', 'order-service', 'orderservice', 'Orders API']) {
      expect(matchKey(name)).toBe('order')
    }
    expect(matchKey('API gateway')).toBe(matchKey('api-gateway'))
    expect(matchKey('Product catalog')).toBe(matchKey('productcatalogservice'))
    expect(matchKey('API')).toBe('api')
  })
})

describe('planTraceFlow', () => {
  it('makes a card for each peer and a request and a response step for each call of a new diagram', () => {
    const plan = planTraceFlow(walk(), { nodes: [], edges: [] }, [])
    expect(plan.matched).toBe(0)
    expect(plan.nodes.map((node) => [nodeLabel(node), (node as CardNodeType).data.form])).toEqual([
      ['Browser', 'client'],
      ['API gateway', 'service'],
      ['Orders', 'service'],
      ['api.stripe.com', 'external'],
      ['PostgreSQL', 'datastore'],
      ['order.created', 'queue'],
      ['Email worker', 'service'],
    ])
    expect(plan.edges.map((edge) => [edge.data!.label, edge.data!.protocol])).toEqual([
      ['HTTPS', 'http'],
      ['gRPC', 'rpc'],
      ['HTTPS', 'http'],
      ['SQL', 'data'],
      ['publish', 'messaging'],
      ['consume', 'messaging'],
    ])
    expect(hops(plan, [], [])).toEqual([
      'Browser',
      'Browser -> API gateway',
      'API gateway -> Orders',
      'Orders -> api.stripe.com',
      'api.stripe.com -> Orders',
      'Orders -> api.stripe.com',
      'api.stripe.com -> Orders',
      'Orders -> PostgreSQL',
      'PostgreSQL -> Orders',
      'Orders -> order.created',
      'order.created -> Orders',
      'Orders -> API gateway',
      'API gateway -> Browser',
      'order.created -> Email worker',
    ])
    expect(plan.flow.steps.map((step) => [step.event, step.latencyMs, step.level])).toEqual([
      ['POST /orders', 412, 'info'],
      ['POST /orders', 412, 'info'],
      ['orders.v1.Orders/CreateOrder', 384, 'info'],
      ['POST /v1/payment_intents', 120, 'info'],
      ['429', null, 'warn'],
      ['POST /v1/payment_intents', 190, 'info'],
      ['200', null, 'info'],
      ['INSERT orders', 4, 'info'],
      ['OK', null, 'info'],
      ['publish order.created', 3, 'info'],
      ['OK', null, 'info'],
      ['OK', null, 'info'],
      ['201', null, 'info'],
      ['process order.created', 140, 'info'],
    ])
    expect(plan.flow).toMatchObject({ name: 'POST /orders', token: { label: 'Request', shape: 'chip' } })
  })

  it('uses the cards and edges of a diagram that has the services', () => {
    const { nodes, edges } = orderSystem()
    const plan = planTraceFlow(walk(), { nodes, edges }, [])
    expect(plan.matched).toBe(7)
    expect(plan.nodes).toEqual([])
    expect(plan.edges).toEqual([])
    expect(hops(plan, nodes, edges)).toEqual([
      'Browser',
      'Browser -> API gateway',
      'API gateway -> Orders',
      'Orders -> Stripe',
      'Stripe -> Orders',
      'Orders -> Stripe',
      'Stripe -> Orders',
      'Orders -> Postgres',
      'Postgres -> Orders',
      'Orders -> order.created',
      'order.created -> Orders',
      'Orders -> API gateway',
      'API gateway -> Browser',
      'order.created -> Email worker',
    ])
  })

  it('adds only the cards and edges that the diagram does not have', () => {
    const { nodes, edges } = orderSystem()
    const withoutStripe = nodes.filter((node) => nodeLabel(node) !== 'Stripe')
    const stripeId = nodes.find((node) => nodeLabel(node) === 'Stripe')!.id
    const plan = planTraceFlow(
      walk(),
      { nodes: withoutStripe, edges: edges.filter((edge) => edge.target !== stripeId) },
      [],
    )
    expect(plan.matched).toBe(6)
    expect(plan.nodes.map(nodeLabel)).toEqual(['api.stripe.com'])
    expect(plan.edges).toHaveLength(1)
    expect(plan.edges[0]).toMatchObject({ target: plan.nodes[0]!.id, data: { label: 'HTTPS' } })
  })

  it('finds a database card by its product icon', () => {
    const { nodes, edges } = orderSystem()
    const renamed = nodes.map((node) =>
      node.type === 'card' && node.data.title === 'Postgres'
        ? { ...node, data: { ...node.data, title: 'Primary', lines: [] } }
        : node,
    )
    const postgres = {
      id: 'logo:postgresql',
      title: 'PostgreSQL',
      category: 'Databases',
      form: 'datastore' as const,
      aliases: ['postgresql', 'postgres'],
      keywords: [],
    }
    const iconSets = [
      { source: 'logo' as const, entries: [postgres], art: {}, byId: new Map([[postgres.id, postgres]]) },
    ]
    const plan = planTraceFlow(walk(), { nodes: renamed, edges }, iconSets)
    expect(plan.nodes).toEqual([])
    expect(hops(plan, renamed, edges)).toContain('Orders -> Primary')
  })
})
