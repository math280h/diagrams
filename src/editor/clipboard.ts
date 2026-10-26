import { toast } from 'sonner'
import { z } from 'zod'
import { absolutePosition } from '@/model/graph'
import { DIAGRAM_VERSION, type StoredEdge, type StoredNode } from '@/model/schema'
import { DiagramFormatError, migrateElements } from '@/persistence/migrations'
import { toStoredEdge, toStoredNode } from '@/persistence/serialize'
import { addNodes, cloneSubgraph, deleteSelection, selectionSubgraph } from '@/store/actions'
import { useDoc } from '@/store/doc-store'

const MARKER = 'diagrams/clipboard@1'
const PASTE_OFFSET = 32
const UNVERSIONED_PAYLOAD_VERSION = 7

const clipboardSchema = z.object({
  marker: z.literal(MARKER),
  version: z.number().int().min(1).default(UNVERSIONED_PAYLOAD_VERSION),
  nodes: z.unknown(),
  edges: z.unknown(),
})

interface ClipboardPayload {
  marker: typeof MARKER
  version: number
  nodes: StoredNode[]
  edges: StoredEdge[]
}

let memory: ClipboardPayload | null = null
let pasteCount = 0

function payloadFromSelection(): ClipboardPayload | null {
  const { nodes, edges } = selectionSubgraph()
  if (nodes.length === 0) return null
  const all = new Map(useDoc.getState().nodes.map((node) => [node.id, node]))
  const included = new Set(nodes.map((node) => node.id))
  const detached = nodes.map((node) =>
    node.parentId && !included.has(node.parentId)
      ? { ...node, parentId: undefined, position: absolutePosition(node, all) }
      : node,
  )
  return {
    marker: MARKER,
    version: DIAGRAM_VERSION,
    nodes: detached.map(toStoredNode),
    edges: edges.map(toStoredEdge).filter((edge): edge is StoredEdge => edge !== null),
  }
}

export function copySelection(event?: ClipboardEvent): boolean {
  const payload = payloadFromSelection()
  if (!payload) return false
  memory = payload
  pasteCount = 0
  const text = JSON.stringify(payload)
  if (event?.clipboardData) {
    event.clipboardData.setData('text/plain', text)
    event.preventDefault()
  } else {
    void navigator.clipboard?.writeText(text).catch(() => undefined)
  }
  return true
}

export function cutSelection(event?: ClipboardEvent) {
  if (copySelection(event)) deleteSelection()
}

function parse(text: string | undefined): ClipboardPayload | null {
  if (!text) return null
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  const result = clipboardSchema.safeParse(raw)
  if (!result.success) return null
  const { nodes, edges } = migrateElements(result.data.nodes, result.data.edges, result.data.version)
  return { marker: MARKER, version: DIAGRAM_VERSION, nodes, edges }
}

/**
 * Pastes the copied nodes.
 *
 * @param at - The canvas point for the top-left corner of the pasted nodes. Without it, the nodes
 *     move a small distance from the copied nodes for each paste.
 */
export function paste(event?: ClipboardEvent, at?: { x: number; y: number }): boolean {
  let payload: ClipboardPayload | null
  try {
    payload = parse(event?.clipboardData?.getData('text/plain')) ?? memory
  } catch (error) {
    if (!(error instanceof DiagramFormatError)) throw error
    event?.preventDefault()
    toast.error(error.message)
    return true
  }
  if (!payload) return false
  event?.preventDefault()
  pasteCount++
  const roots = payload.nodes.filter((node) => !payload.nodes.some((other) => other.id === node.parentId))
  const minX = Math.min(...roots.map((node) => node.position.x))
  const minY = Math.min(...roots.map((node) => node.position.y))
  const offset = at
    ? { x: at.x - minX, y: at.y - minY }
    : { x: PASTE_OFFSET * pasteCount, y: PASTE_OFFSET * pasteCount }
  const copy = cloneSubgraph(
    payload.nodes.map((node) => ({ ...node })),
    payload.edges.map((edge) => ({ ...edge })),
    offset,
  )
  addNodes(copy.nodes, copy.edges)
  if (copy.nodes.length > 1) toast.message(`Pasted ${copy.nodes.length} nodes`)
  return true
}
