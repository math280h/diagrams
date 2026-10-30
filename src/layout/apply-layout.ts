import { followBends } from '@/model/bends'
import type { XY } from '@/model/schema'
import type { DiagramEdge, DiagramNode } from '@/model/types'
import type { LayoutResult } from './diagram-layout'

/** Returns the edge with a new route, or with no route when `route` is undefined. */
export function withRoute(edge: DiagramEdge, route: XY[] | undefined): DiagramEdge {
  if (!edge.data) return edge
  const { route: _previous, ...data } = edge.data
  return { ...edge, data: route ? { ...data, route } : data }
}

/**
 * Applies the positions, group sizes and edge routes of a layout to the current nodes and edges.
 *
 * The layout can come from an earlier copy of the diagram. The function keeps all changes since that copy: added and
 * removed nodes and edges, changed data, and nodes with a new parent. An edge takes the new route only if its ends are
 * the same as in the layout. The corners of a route drawn by hand move with both ends of their edge, and go when the
 * ends move apart, as {@link followBends} describes.
 */
export function applyLayout(nodes: readonly DiagramNode[], edges: DiagramEdge[], laidOut: LayoutResult) {
  const placed = new Map(laidOut.nodes.map((node) => [node.id, node]))
  const routed = new Map(laidOut.edges.map((edge) => [edge.id, edge]))
  const placedNodes = nodes.map((node): DiagramNode => {
    const position = placed.get(node.id)
    if (!position || position.parentId !== node.parentId) return node
    return node.type === 'group'
      ? { ...node, position: position.position, width: position.width, height: position.height }
      : { ...node, position: position.position }
  })
  return {
    nodes: placedNodes,
    edges: followBends(edges, nodes, placedNodes, { dropWhenApart: true }).map((edge): DiagramEdge => {
      const next = routed.get(edge.id)
      if (
        !next ||
        !edge.data ||
        next.source !== edge.source ||
        next.target !== edge.target ||
        next.sourceHandle !== edge.sourceHandle ||
        next.targetHandle !== edge.targetHandle
      ) {
        return edge
      }
      return withRoute(edge, next.data?.route)
    }),
  }
}
