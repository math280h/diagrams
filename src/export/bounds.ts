import { absoluteRect } from '@/model/graph'
import { unionRects } from '@/model/rect'
import type { DiagramNode } from '@/model/types'

const EMPTY_BOUNDS = { x: 0, y: 0, width: 400, height: 300 }

/**
 * Returns the canvas rectangle around nodes.
 *
 * @param only - If given, only these node ids count. Positions still include all parents.
 */
export function diagramBounds(nodes: DiagramNode[], only?: ReadonlySet<string>) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const counted = only ? nodes.filter((node) => only.has(node.id)) : nodes
  return unionRects(counted.map((node) => absoluteRect(node, byId))) ?? EMPTY_BOUNDS
}
