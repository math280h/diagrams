import type { ELK } from 'elkjs/lib/elk-api'
import { arrangeLevels } from './arrange'
import { layoutHierarchy } from './hierarchy'
import { routeEdges, type RouterNode } from './router'
import { buildTree, type LayoutTree } from './tree'
import type { LayoutRequest, LayoutResponse, PlacedNode } from './types'

function hasGroupedLevel(tree: LayoutTree) {
  for (const kids of tree.children.values()) {
    if (kids.filter((id) => tree.isContainer(id)).length >= 2) return true
  }
  return false
}

function absoluteNodes(nodes: PlacedNode[], tree: LayoutTree): RouterNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const absolute = new Map<string, { x: number; y: number }>()
  const resolve = (id: string): { x: number; y: number } => {
    const known = absolute.get(id)
    if (known) return known
    const node = byId.get(id)!
    const parent = tree.parentOf(id)
    const origin = parent === null ? { x: 0, y: 0 } : resolve(parent)
    const position = { x: origin.x + node.x, y: origin.y + node.y }
    absolute.set(id, position)
    return position
  }
  return nodes.map((node) => ({
    id: node.id,
    rect: { ...resolve(node.id), width: node.width, height: node.height },
    parentId: tree.parentOf(node.id) ?? undefined,
  }))
}

/**
 * Computes positions, group sizes and edge routes.
 *
 * The positions come from one ELK layered run over the whole hierarchy. At a level with two or more groups, a grid of
 * the groups replaces that result if the grid gets a better score. The orthogonal router then draws all edges.
 */
export async function computeLayout(elk: ELK, request: LayoutRequest): Promise<LayoutResponse> {
  const tree = buildTree(request)
  const hierarchy = await layoutHierarchy(elk, request, tree)
  if (!hasGroupedLevel(tree)) return hierarchy
  const arrangement = await arrangeLevels(elk, request, tree)
  if (!arrangement.packed) return hierarchy
  const routes = routeEdges(absoluteNodes(arrangement.nodes, tree), request.edges)
  return { nodes: arrangement.nodes, routes: Object.fromEntries(routes) }
}
