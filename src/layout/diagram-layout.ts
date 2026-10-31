import { desktopApi, isDesktop } from '@/desktop/bridge'
import { errorMessage } from '@/lib/error-message'
import { boundaryKind, boundaryKindLabel } from '@/model/boundaries'
import { estimateSize, sortParentsFirst } from '@/model/graph'
import type { DiagramEdge, DiagramNode, GroupNodeType } from '@/model/types'
import { withRoute } from './apply-layout'
import { keepPinned } from './pinned'
import type { LayoutWorkerReply, LayoutWorkerRequest } from './layout.worker'
import type { GraphvizEngine, LayoutDirection, LayoutRequest, LayoutResponse, LayoutStyle } from './types'

export type { LayoutDirection, LayoutStyle } from './types'

/** The arrangement of a layout, and the node at the centre of a `hub` layout. */
export interface LayoutChoice {
  style?: LayoutStyle
  center?: string
}

export interface LayoutResult {
  nodes: DiagramNode[]
  /** The edges, with the route of the layout on each edge that the layout routed. */
  edges: DiagramEdge[]
}

/** The space between two layers of nodes without edge labels or with short ones. */
const MIN_LAYER_GAP_PX = 120
/** The largest space between two layers of nodes that a long edge label can cause. */
const MAX_LAYER_GAP_PX = 280
/** The space on each side of an edge label between two layers. */
const LABEL_MARGIN_PX = 24
/** The width of one character of an edge label at 11 px. */
const EDGE_LABEL_CHAR_PX = 6.8
const EDGE_LABEL_PADDING_PX = 12
/** The width of one character of a group label at 12 px. */
const GROUP_LABEL_CHAR_PX = 7
/** The space that a group label needs next to its text: the inset, the padding and the icon. */
const GROUP_LABEL_EXTRA_PX = 72

function groupLabelWidth(node: GroupNodeType): number {
  const text = [boundaryKindLabel(boundaryKind(node.data.kind)), node.data.label, node.data.detail]
    .filter(Boolean)
    .join('  ')
  return Math.ceil(text.length * GROUP_LABEL_CHAR_PX + GROUP_LABEL_EXTRA_PX)
}

/** Returns the space between layers that fits the longest edge label, within the limits. */
function layerGap(edges: readonly DiagramEdge[]): number {
  const longest = Math.max(0, ...edges.map((edge) => edge.data?.label.trim().length ?? 0))
  const labelPx = longest * EDGE_LABEL_CHAR_PX + EDGE_LABEL_PADDING_PX + LABEL_MARGIN_PX * 2
  return Math.round(Math.min(MAX_LAYER_GAP_PX, Math.max(MIN_LAYER_GAP_PX, labelPx)))
}

let worker: Worker | null = null
let nextRequestId = 0
const pending = new Map<number, { resolve: (response: LayoutResponse) => void; reject: (error: Error) => void }>()

function layoutWorker(): Worker {
  if (worker) return worker
  const created = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module', name: 'layout' })
  created.onmessage = (event: MessageEvent<LayoutWorkerReply>) => {
    const reply = event.data
    if (reply.kind === 'graphviz') {
      void runGraphvizInMain(created, reply)
      return
    }
    const waiting = pending.get(reply.id)
    if (!waiting) return
    pending.delete(reply.id)
    if ('error' in reply) waiting.reject(new Error(reply.error))
    else waiting.resolve(reply.response)
  }
  created.onerror = (event) => {
    for (const waiting of pending.values()) waiting.reject(new Error(event.message || 'The layout worker stopped.'))
    pending.clear()
    created.terminate()
    if (worker === created) worker = null
  }
  worker = created
  return created
}

/** Runs Graphviz for the worker in the main process of the desktop app, and sends the result back. */
async function runGraphvizInMain(
  target: Worker,
  { call, dot, engine }: { call: number; dot: string; engine: GraphvizEngine },
) {
  try {
    const api = desktopApi()
    if (!api) throw new Error('Graphviz runs in the desktop app only.')
    const { plain } = await api.request('layout.graphviz', { dot, engine })
    target.postMessage({ kind: 'graphviz', call, plain } satisfies LayoutWorkerRequest, [])
  } catch (error) {
    target.postMessage({ kind: 'graphviz', call, error: errorMessage(error) } satisfies LayoutWorkerRequest, [])
  }
}

function runLayout(request: LayoutRequest): Promise<LayoutResponse> {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++
    pending.set(id, { resolve, reject })
    layoutWorker().postMessage(
      { kind: 'layout', id, request, graphvizOnPage: isDesktop() } satisfies LayoutWorkerRequest,
      [],
    )
  })
}

/**
 * Computes new positions, group sizes and edge routes in a worker.
 *
 * Text nodes keep their positions. Group nodes get a new size around their children. Each edge between two laid out
 * nodes gets an orthogonal route in canvas coordinates, or loses its old route if the layout found none. Pinned nodes
 * keep their places, as {@link keepPinned} describes.
 */
export async function layoutDiagram(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  direction: LayoutDirection,
  { style = 'flow', center }: LayoutChoice = {},
): Promise<LayoutResult> {
  const laidOut = nodes.filter((node) => node.type !== 'text')
  const ids = new Set(laidOut.map((node) => node.id))
  const layoutEdges = edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target))
  const response = await runLayout({
    nodes: laidOut.map((node) => ({
      id: node.id,
      parentId: node.parentId !== undefined && ids.has(node.parentId) ? node.parentId : undefined,
      ...estimateSize(node),
      minWidth: node.type === 'group' ? groupLabelWidth(node) : 0,
    })),
    edges: layoutEdges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
    direction,
    layerGapPx: layerGap(layoutEdges),
    style,
    ...(center !== undefined && ids.has(center) ? { center } : {}),
  })
  const placed = new Map(response.nodes.map((node) => [node.id, node]))
  const routedIds = new Set(layoutEdges.map((edge) => edge.id))

  const laidOutGraph = {
    nodes: sortParentsFirst(
      nodes.map((node) => {
        const position = placed.get(node.id)
        if (!position) return node
        const next = { ...node, position: { x: position.x, y: position.y } }
        if (node.type === 'group') {
          next.width = position.width
          next.height = position.height
        }
        return next
      }),
    ),
    edges: edges.map((edge) => (routedIds.has(edge.id) ? withRoute(edge, response.routes[edge.id]) : edge)),
  }
  return keepPinned(nodes, edges, laidOutGraph)
}
