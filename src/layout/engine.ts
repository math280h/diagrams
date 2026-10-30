import type { ELK } from 'elkjs/lib/elk-api'
import { arrangeLevels } from './arrange'
import { layoutHierarchy } from './hierarchy'
import { buildTree, type LayoutTree } from './tree'
import type { LayoutRequest, LayoutResponse } from './types'

function hasGroupedLevel(tree: LayoutTree) {
  for (const kids of tree.children.values()) {
    if (kids.filter((id) => tree.isContainer(id)).length >= 2) return true
  }
  return false
}

/**
 * Computes positions and group sizes. The canvas routes the edges.
 *
 * The positions come from one ELK layered run over the whole hierarchy. At a level with two or more groups, a grid of
 * the groups replaces that result if the grid gets a better score.
 */
export async function computeLayout(elk: ELK, request: LayoutRequest): Promise<LayoutResponse> {
  const tree = buildTree(request)
  const hierarchy = await layoutHierarchy(elk, request, tree)
  if (!hasGroupedLevel(tree)) return hierarchy
  const arrangement = await arrangeLevels(elk, request, tree)
  return arrangement.packed ? { nodes: arrangement.nodes } : hierarchy
}
