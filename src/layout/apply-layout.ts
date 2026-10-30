import { followBends } from '@/model/bends'
import type { DiagramEdge, DiagramNode } from '@/model/types'
import type { LayoutResult } from './diagram-layout'

/**
 * Applies the positions and group sizes of a layout to the current nodes and edges.
 *
 * The layout can come from an earlier copy of the diagram. The function keeps all changes since that copy: added and
 * removed nodes and edges, changed data, and nodes with a new parent. The corners of a route drawn by hand move with
 * both ends of their edge, and go when the ends move apart, as {@link followBends} describes.
 */
export function applyLayout(nodes: readonly DiagramNode[], edges: DiagramEdge[], laidOut: LayoutResult) {
  const placed = new Map(laidOut.nodes.map((node) => [node.id, node]))
  const next = nodes.map((node): DiagramNode => {
    const position = placed.get(node.id)
    if (!position || position.parentId !== node.parentId) return node
    return node.type === 'group'
      ? { ...node, position: position.position, width: position.width, height: position.height }
      : { ...node, position: position.position }
  })
  return { nodes: next, edges: followBends(edges, nodes, next, { dropWhenApart: true }) }
}
