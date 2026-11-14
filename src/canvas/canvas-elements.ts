import { hasDetails } from '@/model/details'
import type { DiagramEdge, DiagramNode } from '@/model/types'
import { edgeAriaLabel, nodeAriaLabel, nodeName } from './aria'
import { layerNodes } from './layers'

export function nodeHasDetails(node: DiagramNode): boolean {
  return node.type !== 'text' && hasDetails(node.data.details)
}

const canvasNodes = new Map<string, WeakMap<DiagramNode, DiagramNode>>()
const canvasEdges = new WeakMap<DiagramEdge, DiagramEdge>()
const canvasEdgeLists = new WeakMap<DiagramEdge[], DiagramEdge[]>()

function toCanvasNode(node: DiagramNode, details: boolean, editable: boolean): DiagramNode {
  const key = `${details} ${editable}`
  let known = canvasNodes.get(key)
  if (!known) {
    known = new WeakMap()
    canvasNodes.set(key, known)
  }
  let canvasNode = known.get(node)
  if (!canvasNode) {
    const marks = [
      details && nodeHasDetails(node) && 'dg-has-details',
      editable && node.data.pinned === true && 'dg-pinned',
    ].filter(Boolean)
    const className = [node.className, ...marks].filter(Boolean).join(' ')
    canvasNode = {
      ...node,
      ariaRole: 'group' as const,
      ariaLabel: nodeAriaLabel(node),
      ...(className ? { className } : {}),
    }
    known.set(node, canvasNode)
  }
  return canvasNode
}

/**
 * Returns the nodes that React Flow draws: in stacking order, with a name for screen readers and the canvas marks.
 *
 * @param details - If true, the nodes with details get the `dg-has-details` class.
 * @param editable - If true, the pinned nodes get the `dg-pinned` class.
 * @returns The same object as in an earlier call for each node that has the same object and the same flags.
 */
export function toCanvasNodes(nodes: DiagramNode[], details: boolean, editable: boolean): DiagramNode[] {
  return layerNodes(nodes).map((node) => toCanvasNode(node, details, editable))
}

/**
 * Returns the edges that React Flow draws, with a name for screen readers from the names of their ends.
 *
 * @returns The same object as in an earlier call for each edge that has the same object and the same name, and the
 * same array when all the edges are the same.
 */
export function toCanvasEdges(edges: DiagramEdge[], nodes: DiagramNode[]): DiagramEdge[] {
  const names = new Map(nodes.map((node) => [node.id, nodeName(node)]))
  const nameOf = (id: string) => names.get(id) ?? 'a missing node'
  const next = edges.map((edge) => {
    const ariaLabel = edgeAriaLabel(edge, nameOf)
    let canvasEdge = canvasEdges.get(edge)
    if (canvasEdge?.ariaLabel !== ariaLabel) {
      canvasEdge = { ...edge, ariaLabel }
      canvasEdges.set(edge, canvasEdge)
    }
    return canvasEdge
  })
  const previous = canvasEdgeLists.get(edges)
  if (previous?.length === next.length && previous.every((edge, index) => edge === next[index])) return previous
  canvasEdgeLists.set(edges, next)
  return next
}
