import { absolutePosition } from './graph'
import type { XY } from './schema'
import type { DiagramEdge, DiagramNode } from './types'

function positions(nodes: readonly DiagramNode[]): Map<string, XY> {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return new Map(nodes.map((node) => [node.id, absolutePosition(node, byId)]))
}

/**
 * Moves the corners of the routes that a person drew after nodes moved.
 *
 * When both ends of an edge moved by the same distance, as in a drag of both or of their group, the corners move with
 * them. When only one end moved, the corners stay, and the ends attach to the nodes again. With `dropWhenApart`, as
 * after a layout, an edge whose ends moved apart loses its corners and routes around the nodes again.
 *
 * @returns The edges, or the same array if no corners changed.
 */
export function followBends(
  edges: DiagramEdge[],
  before: readonly DiagramNode[],
  after: readonly DiagramNode[],
  { dropWhenApart = false } = {},
): DiagramEdge[] {
  if (!edges.some((edge) => edge.data?.bends?.length)) return edges
  const from = positions(before)
  const to = positions(after)
  const moved = (id: string): XY | null => {
    const a = from.get(id)
    const b = to.get(id)
    return a && b ? { x: b.x - a.x, y: b.y - a.y } : null
  }
  let changed = false
  const next = edges.map((edge): DiagramEdge => {
    const bends = edge.data?.bends
    if (!edge.data || !bends?.length) return edge
    const source = moved(edge.source)
    const target = moved(edge.target)
    if (!source || !target) return edge
    if (source.x === target.x && source.y === target.y) {
      if (source.x === 0 && source.y === 0) return edge
      changed = true
      return {
        ...edge,
        data: { ...edge.data, bends: bends.map((point) => ({ x: point.x + source.x, y: point.y + source.y })) },
      }
    }
    if (!dropWhenApart) return edge
    changed = true
    const { bends: _bends, ...data } = edge.data
    return { ...edge, data }
  })
  return changed ? next : edges
}
