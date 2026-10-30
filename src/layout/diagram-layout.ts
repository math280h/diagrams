import { boundaryKind, boundaryKindLabel } from '@/model/boundaries'
import { estimateSize, sortParentsFirst } from '@/model/graph'
import type { DiagramEdge, DiagramNode, GroupNodeType } from '@/model/types'
import { keepPinned } from './pinned'
import type { LayoutWorkerReply, LayoutWorkerRequest } from './layout.worker'
import type { LayoutDirection, LayoutRequest, LayoutResponse } from './types'

export type { LayoutDirection } from './types'

export interface LayoutResult {
  nodes: DiagramNode[]
  /** The edges as they were: a layout moves nodes only. */
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

function runLayout(request: LayoutRequest): Promise<LayoutResponse> {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++
    pending.set(id, { resolve, reject })
    layoutWorker().postMessage({ id, request } satisfies LayoutWorkerRequest, [])
  })
}

/**
 * Computes new positions and group sizes in a worker.
 *
 * Text nodes keep their positions. Group nodes get a new size around their children. Pinned nodes keep their places,
 * as {@link keepPinned} describes. The canvas routes the edges around the new positions.
 */
export async function layoutDiagram(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  direction: LayoutDirection,
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
  })
  const placed = new Map(response.nodes.map((node) => [node.id, node]))

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
    edges,
  }
  return keepPinned(nodes, laidOutGraph)
}
