import type { LayoutNode, LayoutRequest } from './types'

/** The parents and children of the nodes of a layout request. The root container is `null`. */
export interface LayoutTree {
  nodes: Map<string, LayoutNode>
  children: Map<string | null, string[]>
  parentOf(id: string): string | null
  isContainer(id: string): boolean
}

export function buildTree(request: LayoutRequest): LayoutTree {
  const nodes = new Map(request.nodes.map((node) => [node.id, node]))
  const parentOf = (id: string) => {
    const parentId = nodes.get(id)?.parentId
    return parentId !== undefined && nodes.has(parentId) ? parentId : null
  }
  const children = new Map<string | null, string[]>([[null, []]])
  for (const node of request.nodes) children.set(node.id, [])
  for (const node of request.nodes) children.get(parentOf(node.id))!.push(node.id)
  return { nodes, children, parentOf, isContainer: (id) => (children.get(id)?.length ?? 0) > 0 }
}

/** Returns the containers of a node from its parent up to the root, which is `null`. */
function containersOf(tree: LayoutTree, id: string): (string | null)[] {
  const out: (string | null)[] = []
  for (let parent = tree.parentOf(id); parent !== null; parent = tree.parentOf(parent)) {
    if (out.includes(parent)) break
    out.push(parent)
  }
  out.push(null)
  return out
}

export function lowestCommonContainer(tree: LayoutTree, a: string, b: string): string | null {
  const above = new Set(containersOf(tree, b))
  return containersOf(tree, a).find((container) => above.has(container)) ?? null
}

/** Returns the direct child of `container` that holds `id`, or `id` itself if it is a direct child. */
export function childUnder(tree: LayoutTree, container: string | null, id: string): string | null {
  let current = id
  for (let depth = 0; depth <= tree.nodes.size; depth++) {
    const parent = tree.parentOf(current)
    if (parent === container) return current
    if (parent === null) return null
    current = parent
  }
  return null
}
