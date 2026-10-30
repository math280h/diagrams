import { useStoreApi, type ReactFlowState } from '@xyflow/react'
import { createContext, use, useLayoutEffect, useSyncExternalStore } from 'react'
import { routeEdges, type RouterEdge, type RouterNode } from '@/layout/router'
import type { Rect } from '@/model/rect'
import type { EdgeData, Side, XY } from '@/model/schema'
import type { DiagramEdge, DiagramNode } from '@/model/types'
import { internalRect } from './geometry'

/** The path styles that route at right angles around other nodes. Curves and straight lines keep their own shape. */
export const ROUTED_PATHS: ReadonlySet<EdgeData['path']> = new Set(['smooth', 'step'])

/** The space around a moving node in which the route of another edge counts as in its way. */
const MOVING_CLEARANCE_PX = 24

const SIDES: ReadonlySet<string> = new Set<Side>(['top', 'right', 'bottom', 'left'])

/** Holds the automatic route of each edge, and tells the edges when their routes change. */
export interface RouteStore {
  get: (id: string) => readonly XY[] | undefined
  subscribe: (listener: () => void) => () => void
  /** Replaces all routes. */
  replace: (routes: ReadonlyMap<string, XY[]>) => void
  /** Replaces the routes of the given edges, and keeps the others. */
  patch: (ids: ReadonlySet<string>, routes: ReadonlyMap<string, XY[]>) => void
}

function sameRoute(a: readonly XY[], b: readonly XY[]) {
  return a.length === b.length && a.every((point, index) => point.x === b[index]!.x && point.y === b[index]!.y)
}

export function createRouteStore(): RouteStore {
  let routes = new Map<string, readonly XY[]>()
  const listeners = new Set<() => void>()
  const commit = (next: Map<string, readonly XY[]>) => {
    let changed = next.size !== routes.size
    for (const [id, route] of next) {
      const old = routes.get(id)
      if (old && sameRoute(old, route)) next.set(id, old)
      else changed = true
    }
    routes = next
    if (changed) for (const listener of listeners) listener()
  }
  return {
    get: (id) => routes.get(id),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    replace: (next) => commit(new Map(next)),
    patch: (ids, next) => {
      const merged = new Map(routes)
      for (const id of ids) {
        const route = next.get(id)
        if (route) merged.set(id, route)
        else merged.delete(id)
      }
      commit(merged)
    },
  }
}

export const RouteStoreContext = createContext<RouteStore>(createRouteStore())

/** Returns the automatic route of an edge, or `undefined` while it has none. */
export function useEdgeRoute(id: string): readonly XY[] | undefined {
  const store = use(RouteStoreContext)
  return useSyncExternalStore(store.subscribe, () => store.get(id))
}

interface RoutingInput {
  nodes: RouterNode[]
  edges: RouterEdge[]
  /** The nodes that a drag moves, with the nodes inside them. */
  moving: Set<string>
  /** Changes when a node rectangle, a parent or an edge to route changes. */
  key: string
}

function fixedSide(edge: DiagramEdge, handle: string | null | undefined): Side | undefined {
  return edge.data?.sides === 'fixed' && handle && SIDES.has(handle) ? (handle as Side) : undefined
}

function routingInput(state: ReactFlowState<DiagramNode, DiagramEdge>): RoutingInput {
  const nodes: RouterNode[] = []
  const dragging = new Set<string>()
  const keys: string[] = []
  for (const node of state.nodeLookup.values()) {
    if (node.type === 'text' || node.hidden) continue
    const rect = internalRect(node)
    if (rect.width === 0 || rect.height === 0) continue
    nodes.push({ id: node.id, rect, parentId: node.parentId })
    if (node.dragging) dragging.add(node.id)
    keys.push(`${node.id}:${rect.x},${rect.y},${rect.width},${rect.height},${node.parentId ?? ''}`)
  }
  const moving = new Set(dragging)
  if (dragging.size > 0) {
    for (const node of nodes) {
      for (let parent = node.parentId; parent !== undefined; parent = state.nodeLookup.get(parent)?.parentId) {
        if (dragging.has(parent)) {
          moving.add(node.id)
          break
        }
      }
    }
  }
  const placed = new Set(nodes.map((node) => node.id))
  const edges: RouterEdge[] = []
  for (const edge of state.edges) {
    const data = edge.data
    if (!data || !ROUTED_PATHS.has(data.path) || (data.bends?.length ?? 0) > 0) continue
    if (edge.source === edge.target || !placed.has(edge.source) || !placed.has(edge.target)) continue
    const routed = {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceSide: fixedSide(edge, edge.sourceHandle),
      targetSide: fixedSide(edge, edge.targetHandle),
    }
    edges.push(routed)
    keys.push(`${edge.id}:${edge.source}>${edge.target}:${routed.sourceSide ?? ''}:${routed.targetSide ?? ''}`)
  }
  return { nodes, edges, moving, key: `${moving.size > 0 ? 'moving' : 'still'}|${keys.join('|')}` }
}

function crosses(route: readonly XY[], rect: Rect) {
  const left = rect.x - MOVING_CLEARANCE_PX
  const right = rect.x + rect.width + MOVING_CLEARANCE_PX
  const top = rect.y - MOVING_CLEARANCE_PX
  const bottom = rect.y + rect.height + MOVING_CLEARANCE_PX
  return route.slice(1).some((point, index) => {
    const before = route[index]!
    return (
      Math.max(point.x, before.x) > left &&
      Math.min(point.x, before.x) < right &&
      Math.max(point.y, before.y) > top &&
      Math.min(point.y, before.y) < bottom
    )
  })
}

/** Returns the edges to route again while nodes move: the edges of the moving nodes, and the edges in their way. */
function edgesToMove(input: RoutingInput, store: RouteStore): RouterEdge[] {
  const rects = input.nodes.filter((node) => input.moving.has(node.id)).map((node) => node.rect)
  return input.edges.filter((edge) => {
    if (input.moving.has(edge.source) || input.moving.has(edge.target)) return true
    const route = store.get(edge.id)
    return !route || rects.some((rect) => crosses(route, rect))
  })
}

/**
 * Routes the edges of the canvas around the nodes, as `routeEdges` describes, and keeps the routes in the store.
 *
 * It routes all edges when nodes, their sizes or the edges change. While a drag moves nodes, it routes only the edges
 * of the moving nodes and the edges in their way, once for each animation frame, and all edges again after the drop.
 *
 * Put this component inside the `ReactFlow` element.
 */
export function EdgeRouter({ store }: { store: RouteStore }) {
  const api = useStoreApi<DiagramNode, DiagramEdge>()

  useLayoutEffect(() => {
    let key = ''
    let frame = 0
    const run = () => {
      frame = 0
      const input = routingInput(api.getState())
      if (input.key === key) return
      key = input.key
      if (input.moving.size === 0) {
        store.replace(routeEdges(input.nodes, input.edges))
        return
      }
      const edges = edgesToMove(input, store)
      store.patch(new Set(edges.map((edge) => edge.id)), routeEdges(input.nodes, edges))
    }
    run()
    const unsubscribe = api.subscribe((state, previous) => {
      const panned = state.transform !== previous.transform
      if (panned && state.nodes === previous.nodes && state.edges === previous.edges) return
      const dragging = state.nodes.some((node) => node.dragging)
      if (dragging) {
        frame ||= requestAnimationFrame(run)
        return
      }
      cancelAnimationFrame(frame)
      run()
    })
    return () => {
      unsubscribe()
      cancelAnimationFrame(frame)
    }
  }, [api, store])

  return null
}
