import { boundaryKind, SOLID_TIERS } from '@/model/boundaries'
import type { DiagramNode } from '@/model/types'

/**
 * The stacking order of solid boundaries.
 *
 * The value is above the other boundaries at every depth and below the cards.
 */
export const SOLID_GROUP_Z = 500

const layered = new WeakMap<DiagramNode, DiagramNode>()

function layer(node: DiagramNode): DiagramNode {
  if (node.type !== 'group' || !SOLID_TIERS.has(boundaryKind(node.data.kind).tier)) return node
  let result = layered.get(node)
  if (!result) {
    result = { ...node, zIndex: SOLID_GROUP_Z + (node.zIndex ?? -1) + 1 }
    layered.set(node, result)
  }
  return result
}

/** Returns the nodes with each solid boundary above the boundaries that it overlaps. */
export function layerNodes(nodes: DiagramNode[]): DiagramNode[] {
  return nodes.map(layer)
}
