import ELK from 'elkjs/lib/elk.bundled.js'
import { describe, expect, it } from 'vitest'
import { GROUP_PADDING_PX } from '@/model/graph'
import { computeLayout } from './engine'
import type { LayoutEdge, LayoutNode, LayoutRequest, PlacedNode } from './types'

const elk = new ELK()

function builder() {
  const nodes: LayoutNode[] = []
  const edges: LayoutEdge[] = []
  return {
    nodes,
    edges,
    card(id: string, parentId?: string) {
      nodes.push({ id, parentId, width: 216, height: 60, minWidth: 0 })
      return id
    },
    group(id: string, parentId?: string) {
      nodes.push({ id, parentId, width: 400, height: 300, minWidth: 240 })
      return id
    },
    edge(source: string, target: string) {
      edges.push({ id: `${source}->${target}`, source, target })
    },
  }
}

function absolute(placed: PlacedNode[], request: LayoutRequest) {
  const byId = new Map(placed.map((node) => [node.id, node]))
  const parentOf = new Map(request.nodes.map((node) => [node.id, node.parentId]))
  const resolve = (id: string): { x: number; y: number; width: number; height: number } => {
    const node = byId.get(id)!
    const parent = parentOf.get(id)
    const origin = parent ? resolve(parent) : { x: 0, y: 0 }
    return { x: origin.x + node.x, y: origin.y + node.y, width: node.width, height: node.height }
  }
  return new Map(placed.map((node) => [node.id, resolve(node.id)]))
}

/** A hub of six team groups that all call a platform group and the next team. */
function hub(): LayoutRequest {
  const b = builder()
  b.group('platform')
  const auth = b.card('auth', 'platform')
  const bus = b.card('bus', 'platform')
  let previous: string | null = null
  for (const team of ['orders', 'billing', 'search', 'profile', 'media', 'reports']) {
    b.group(team)
    const api = b.card(`${team}-api`, team)
    const db = b.card(`${team}-db`, team)
    b.edge(api, db)
    b.edge(api, auth)
    b.edge(api, bus)
    if (previous) b.edge(previous, api)
    previous = api
  }
  return { nodes: b.nodes, edges: b.edges, direction: 'DOWN', layerGapPx: 120 }
}

/** A tiered flow: a client, then edge, app and data groups. */
function tiers(): LayoutRequest {
  const b = builder()
  const client = b.card('client')
  b.group('edge')
  const lb = b.card('lb', 'edge')
  b.group('app')
  const api = b.card('api', 'app')
  b.group('data')
  const db = b.card('db', 'data')
  b.edge(client, lb)
  b.edge(lb, api)
  b.edge(api, db)
  return { nodes: b.nodes, edges: b.edges, direction: 'RIGHT', layerGapPx: 120 }
}

describe('computeLayout', () => {
  it('keeps a flow of groups in layers from left to right', async () => {
    const request = tiers()
    const response = await computeLayout(elk, request)
    const rects = absolute(response.nodes, request)
    const order = ['client', 'lb', 'api', 'db'].map((id) => rects.get(id)!.x)
    expect(order).toEqual(order.toSorted((a, b) => a - b))
  })

  it('puts a hub of many groups in a compact grid', async () => {
    const request = hub()
    const response = await computeLayout(elk, request)
    const rects = absolute(response.nodes, request)
    const groups = ['platform', 'orders', 'billing', 'search', 'profile', 'media', 'reports'].map((id) =>
      rects.get(id)!,
    )
    const width = Math.max(...groups.map((rect) => rect.x + rect.width)) - Math.min(...groups.map((rect) => rect.x))
    const height = Math.max(...groups.map((rect) => rect.y + rect.height)) - Math.min(...groups.map((rect) => rect.y))
    expect(width / height).toBeGreaterThan(0.6)
    expect(width / height).toBeLessThan(3)
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i]!
        const b = groups[j]!
        const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
        expect(apart).toBe(true)
      }
    }
  })

  it('places children inside their group with the group padding', async () => {
    const request = hub()
    const response = await computeLayout(elk, request)
    const rects = absolute(response.nodes, request)
    for (const node of request.nodes) {
      if (!node.parentId) continue
      const child = rects.get(node.id)!
      const parent = rects.get(node.parentId)!
      expect(child.x).toBeGreaterThanOrEqual(parent.x + GROUP_PADDING_PX.side - 0.5)
      expect(child.y).toBeGreaterThanOrEqual(parent.y + GROUP_PADDING_PX.top - 0.5)
      expect(child.x + child.width).toBeLessThanOrEqual(parent.x + parent.width - GROUP_PADDING_PX.side + 0.5)
      expect(child.y + child.height).toBeLessThanOrEqual(parent.y + parent.height - GROUP_PADDING_PX.bottom + 0.5)
    }
  })
})
