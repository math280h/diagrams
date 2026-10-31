import ELK from 'elkjs/lib/elk.bundled.js'
import { describe, expect, it } from 'vitest'
import { GROUP_PADDING_PX } from '@/model/graph'
import { computeLayout } from './engine'
import { laneColumns } from './lanes'
import { hubTree } from './styles'
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
  return { nodes: b.nodes, edges: b.edges, direction: 'DOWN', layerGapPx: 120, style: 'flow' }
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
  return { nodes: b.nodes, edges: b.edges, direction: 'RIGHT', layerGapPx: 120, style: 'flow' }
}

describe('computeLayout', () => {
  it('keeps a flow of groups in layers from left to right', async () => {
    const request = tiers()
    const response = await computeLayout(elk, request)
    const rects = absolute(response.nodes, request)
    const order = ['client', 'lb', 'api', 'db'].map((id) => rects.get(id)!.x)
    expect(order).toEqual(order.toSorted((a, b) => a - b))
    expect(Object.keys(response.routes)).toHaveLength(request.edges.length)
  })

  it('puts a hub of many groups in a compact grid and routes every edge', async () => {
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
    expect(Object.keys(response.routes)).toHaveLength(request.edges.length)
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

type Box = { x: number; y: number; width: number; height: number }

function siblingsApart(rects: Map<string, Box>, request: LayoutRequest) {
  const parentOf = new Map(request.nodes.map((node) => [node.id, node.parentId]))
  const ids = [...rects.keys()]
  return ids.every((a, index) =>
    ids.slice(index + 1).every((b) => {
      if (parentOf.get(a) !== parentOf.get(b)) return true
      const p = rects.get(a)!
      const q = rects.get(b)!
      return (
        p.x + p.width <= q.x + 0.5 ||
        q.x + q.width <= p.x + 0.5 ||
        p.y + p.height <= q.y + 0.5 ||
        q.y + q.height <= p.y + 0.5
      )
    }),
  )
}

function insideParents(rects: Map<string, Box>, request: LayoutRequest) {
  return request.nodes.every((node) => {
    if (!node.parentId) return true
    const child = rects.get(node.id)!
    const parent = rects.get(node.parentId)!
    return (
      child.x >= parent.x + GROUP_PADDING_PX.side - 0.5 &&
      child.y >= parent.y + GROUP_PADDING_PX.top - 0.5 &&
      child.x + child.width <= parent.x + parent.width - GROUP_PADDING_PX.side + 0.5 &&
      child.y + child.height <= parent.y + parent.height - GROUP_PADDING_PX.bottom + 0.5
    )
  })
}

function centreOf(rect: Box) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

/** An org chart: a root with three leads, each with two reports. */
function orgChart(): LayoutRequest {
  const b = builder()
  const root = b.card('ceo')
  for (const lead of ['cto', 'cfo', 'coo']) {
    b.card(lead)
    b.edge(root, lead)
    for (const report of ['a', 'b']) b.edge(lead, b.card(`${lead}-${report}`))
  }
  return { nodes: b.nodes, edges: b.edges, direction: 'DOWN', layerGapPx: 120, style: 'tree' }
}

/** A bus with eight spokes, two of which also talk to each other. */
function star(center?: string): LayoutRequest {
  const b = builder()
  const bus = b.card('bus')
  for (let spoke = 0; spoke < 8; spoke++) b.edge(b.card(`s${spoke}`), bus)
  b.edge('s0', 's1')
  return {
    nodes: b.nodes,
    edges: b.edges,
    direction: 'RIGHT',
    layerGapPx: 120,
    style: 'hub',
    ...(center ? { center } : {}),
  }
}

describe('layout styles', () => {
  it.each(['tree', 'hub', 'network', 'grid'] as const)(
    'keeps nested groups around their nodes, keeps siblings apart and routes every edge with %s',
    async (style) => {
      const request = { ...hub(), style }
      const response = await computeLayout(elk, request)
      const rects = absolute(response.nodes, request)
      expect(insideParents(rects, request)).toBe(true)
      expect(siblingsApart(rects, request)).toBe(true)
      expect(Object.keys(response.routes)).toHaveLength(request.edges.length)
    },
  )

  it.each(['flow', 'tree', 'hub', 'network', 'grid'] as const)(
    'lays out a diagram without nodes with %s',
    async (style) => {
      const request: LayoutRequest = { nodes: [], edges: [], direction: 'RIGHT', layerGapPx: 120, style }
      expect(await computeLayout(elk, request)).toEqual({ nodes: [], routes: {} })
    },
  )

  it('puts each child of a tree below its parent', async () => {
    const request = orgChart()
    const rects = absolute((await computeLayout(elk, request)).nodes, request)
    for (const edge of request.edges) {
      const parent = rects.get(edge.source)!
      expect(rects.get(edge.target)!.y).toBeGreaterThanOrEqual(parent.y + parent.height)
    }
    expect(siblingsApart(rects, request)).toBe(true)
  })

  it.each([
    [undefined, 'bus'],
    ['s3', 's3'],
  ])('puts the hub in the middle of the other nodes (centre %s)', async (center, middle) => {
    const request = star(center)
    const rects = absolute((await computeLayout(elk, request)).nodes, request)
    const others = [...rects.keys()].filter((id) => id !== middle).map((id) => centreOf(rects.get(id)!))
    const mean = {
      x: others.reduce((sum, point) => sum + point.x, 0) / others.length,
      y: others.reduce((sum, point) => sum + point.y, 0) / others.length,
    }
    const spread = Math.max(...others.map((point) => Math.hypot(point.x - mean.x, point.y - mean.y)))
    const hubCentre = centreOf(rects.get(middle)!)
    expect(Math.hypot(hubCentre.x - mean.x, hubCentre.y - mean.y)).toBeLessThan(spread / 2)
    expect(siblingsApart(rects, request)).toBe(true)
  })

  it('packs unconnected cards into a compact grid', async () => {
    const b = builder()
    for (let card = 0; card < 12; card++) b.card(`c${card}`)
    const request: LayoutRequest = { nodes: b.nodes, edges: [], direction: 'RIGHT', layerGapPx: 120, style: 'grid' }
    const rects = [...absolute((await computeLayout(elk, request)).nodes, request).values()]
    const width = Math.max(...rects.map((rect) => rect.x + rect.width)) - Math.min(...rects.map((rect) => rect.x))
    const height = Math.max(...rects.map((rect) => rect.y + rect.height)) - Math.min(...rects.map((rect) => rect.y))
    expect(width / height).toBeGreaterThan(0.8)
    expect(width / height).toBeLessThan(3)
  })

  it('keeps a network of separate pairs compact', async () => {
    const b = builder()
    for (let pair = 0; pair < 6; pair++) b.edge(b.card(`p${pair}a`), b.card(`p${pair}b`))
    const request: LayoutRequest = {
      nodes: b.nodes,
      edges: b.edges,
      direction: 'RIGHT',
      layerGapPx: 120,
      style: 'network',
    }
    const rects = [...absolute((await computeLayout(elk, request)).nodes, request).values()]
    const width = Math.max(...rects.map((rect) => rect.x + rect.width)) - Math.min(...rects.map((rect) => rect.x))
    const height = Math.max(...rects.map((rect) => rect.y + rect.height)) - Math.min(...rects.map((rect) => rect.y))
    const cardArea = rects.reduce((sum, rect) => sum + rect.width * rect.height, 0)
    expect(cardArea / (width * height)).toBeGreaterThan(0.2)
  })

  it('gives the same network layout each time', async () => {
    const b = builder()
    const ids = Array.from({ length: 10 }, (_, index) => b.card(`n${index}`))
    for (let a = 0; a < ids.length; a++) for (const step of [1, 3]) b.edge(ids[a]!, ids[(a + step) % ids.length]!)
    const request: LayoutRequest = {
      nodes: b.nodes,
      edges: b.edges,
      direction: 'RIGHT',
      layerGapPx: 120,
      style: 'network',
    }
    const first = await computeLayout(elk, request)
    const second = await computeLayout(elk, request)
    expect(second.nodes).toEqual(first.nodes)
    expect(siblingsApart(absolute(first.nodes, request), request)).toBe(true)
  })
})

describe('hubTree', () => {
  const boxes = ['a', 'b', 'c', 'd', 'lonely'].map((id) => ({ id, width: 10, height: 10 }))
  const links = [
    { source: 'b', target: 'a' },
    { source: 'c', target: 'a' },
    { source: 'a', target: 'd' },
    { source: 'c', target: 'd' },
  ]

  it('grows a tree from the box with the most links, and links each unreached box to it', () => {
    const tree = hubTree(boxes, links, null)
    expect(tree).toHaveLength(boxes.length - 1)
    expect(new Set(tree.map((link) => link.target))).toEqual(new Set(['b', 'c', 'd', 'lonely']))
    expect(tree.filter((link) => link.source === 'a').map((link) => link.target)).toContain('lonely')
  })

  it('grows the tree from the centre that the caller names', () => {
    const tree = hubTree(boxes, links, 'd')
    expect(tree.every((link) => link.target !== 'd')).toBe(true)
    expect(tree).toHaveLength(boxes.length - 1)
  })
})

describe('Graphviz layouts', () => {
  it.each(['dot', 'neato', 'fdp', 'circo', 'twopi', 'osage', 'lanes'] as const)(
    'keeps nested groups around their nodes, keeps siblings apart and routes every edge with %s',
    async (style) => {
      const request = { ...hub(), style }
      const response = await computeLayout(elk, request)
      const rects = absolute(response.nodes, request)
      expect(insideParents(rects, request)).toBe(true)
      expect(siblingsApart(rects, request)).toBe(true)
      expect(Object.keys(response.routes)).toHaveLength(request.edges.length)
    },
  )

  it('puts each child after its parent with dot', async () => {
    const request = { ...orgChart(), style: 'dot' as const }
    const rects = absolute((await computeLayout(elk, request)).nodes, request)
    for (const edge of request.edges) {
      const parent = rects.get(edge.source)!
      expect(rects.get(edge.target)!.y).toBeGreaterThanOrEqual(parent.y + parent.height)
    }
  })

  it('puts a ring on a circle with circo', async () => {
    const b = builder()
    const ids = Array.from({ length: 8 }, (_, index) => b.card(`r${index}`))
    ids.forEach((id, index) => b.edge(id, ids[(index + 1) % ids.length]!))
    const request: LayoutRequest = {
      nodes: b.nodes,
      edges: b.edges,
      direction: 'RIGHT',
      layerGapPx: 120,
      style: 'circo',
    }
    const centres = [...absolute((await computeLayout(elk, request)).nodes, request).values()].map(centreOf)
    const middle = {
      x: centres.reduce((sum, point) => sum + point.x, 0) / centres.length,
      y: centres.reduce((sum, point) => sum + point.y, 0) / centres.length,
    }
    const distances = centres.map((point) => Math.hypot(point.x - middle.x, point.y - middle.y))
    expect(Math.min(...distances) / Math.max(...distances)).toBeGreaterThan(0.8)
  })

  it('puts the root in the middle with twopi', async () => {
    const request = { ...star('s3'), style: 'twopi' as const }
    const rects = absolute((await computeLayout(elk, request)).nodes, request)
    const others = [...rects.keys()].filter((id) => id !== 's3').map((id) => centreOf(rects.get(id)!))
    const mean = {
      x: others.reduce((sum, point) => sum + point.x, 0) / others.length,
      y: others.reduce((sum, point) => sum + point.y, 0) / others.length,
    }
    const spread = Math.max(...others.map((point) => Math.hypot(point.x - mean.x, point.y - mean.y)))
    const root = centreOf(rects.get('s3')!)
    expect(Math.hypot(root.x - mean.x, root.y - mean.y)).toBeLessThan(spread / 2)
  })
})

/** Lanes for clients, services and data, with a user outside every lane. */
function lanesRequest(direction: LayoutRequest['direction']): LayoutRequest {
  const b = builder()
  const user = b.card('user')
  b.group('clients')
  const web = b.card('web', 'clients')
  const app = b.card('app', 'clients')
  b.group('services')
  const api = b.card('api', 'services')
  const worker = b.card('worker', 'services')
  b.group('data')
  const db = b.card('db', 'data')
  b.edge(user, web)
  b.edge(user, app)
  b.edge(web, api)
  b.edge(app, api)
  b.edge(api, worker)
  b.edge(worker, db)
  b.edge(api, db)
  return { nodes: b.nodes, edges: b.edges, direction, layerGapPx: 120, style: 'lanes' }
}

describe('lanes', () => {
  it('stacks the top-level groups as lanes of one width, with columns that follow the edges', async () => {
    const request = lanesRequest('RIGHT')
    const rects = absolute((await computeLayout(elk, request)).nodes, request)
    const lanes = ['clients', 'services', 'data'].map((id) => rects.get(id)!)
    expect(new Set(lanes.map((lane) => Math.round(lane.width))).size).toBe(1)
    expect(new Set(lanes.map((lane) => Math.round(lane.x))).size).toBe(1)
    lanes
      .slice(1)
      .forEach((lane, index) => expect(lane.y).toBeGreaterThanOrEqual(lanes[index]!.y + lanes[index]!.height))
    expect(rects.get('user')!.y + rects.get('user')!.height).toBeLessThanOrEqual(lanes[0]!.y)
    for (const edge of request.edges) expect(rects.get(edge.target)!.x).toBeGreaterThan(rects.get(edge.source)!.x)
    expect(Math.round(centreOf(rects.get('web')!).x)).toBe(Math.round(centreOf(rects.get('app')!).x))
    expect(insideParents(rects, request)).toBe(true)
    expect(siblingsApart(rects, request)).toBe(true)
  })

  it('turns the lanes into columns with DOWN', async () => {
    const request = lanesRequest('DOWN')
    const rects = absolute((await computeLayout(elk, request)).nodes, request)
    const lanes = ['clients', 'services', 'data'].map((id) => rects.get(id)!)
    expect(new Set(lanes.map((lane) => Math.round(lane.height))).size).toBe(1)
    lanes
      .slice(1)
      .forEach((lane, index) => expect(lane.x).toBeGreaterThanOrEqual(lanes[index]!.x + lanes[index]!.width))
    for (const edge of request.edges) expect(rects.get(edge.target)!.y).toBeGreaterThan(rects.get(edge.source)!.y)
    expect(insideParents(rects, request)).toBe(true)
  })

  it('gives each unit a column, also in a cycle', () => {
    const columns = laneColumns(
      ['a', 'b', 'c', 'd'],
      [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'a'],
        ['c', 'd'],
        ['a', 'b'],
      ],
    )
    expect(Object.fromEntries(columns)).toEqual({ a: 0, b: 1, c: 2, d: 3 })
  })
})
