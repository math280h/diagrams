import { edgeTravel, type EdgeEnds } from './flow/compile'

/**
 * Finds the shortest chain of edges between two nodes.
 *
 * The search ignores edge direction.
 *
 * @returns The edge ids in travel order, an empty list if the nodes are the same, or `null` if no
 *     chain exists.
 */
export function findEdgePath(from: string, to: string, edges: readonly EdgeEnds[]): string[] | null {
  if (from === to) return []
  const adjacency = new Map<string, { edge: string; next: string }[]>()
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, [])
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, [])
    adjacency.get(edge.source)!.push({ edge: edge.id, next: edge.target })
    adjacency.get(edge.target)!.push({ edge: edge.id, next: edge.source })
  }
  const previous = new Map<string, { node: string; edge: string }>()
  const queue = [from]
  const seen = new Set([from])
  while (queue.length > 0) {
    const node = queue.shift()!
    if (node === to) break
    for (const { edge, next } of adjacency.get(node) ?? []) {
      if (seen.has(next)) continue
      seen.add(next)
      previous.set(next, { node, edge })
      queue.push(next)
    }
  }
  if (!previous.has(to)) return null
  const path: string[] = []
  let cursor = to
  while (cursor !== from) {
    const step = previous.get(cursor)!
    path.unshift(step.edge)
    cursor = step.node
  }
  return path
}

/**
 * Returns the edges that take the tokens on other nodes to the first node after `from` on a route, at the same time
 * as the first edge of the route. A token on a node of the route stays.
 *
 * @param route - The edge ids in travel order from `from`, see {@link findEdgePath}.
 * @param resting - The nodes that have a token before the route. The direction of each edge comes from them, as in
 *     {@link edgeTravel}.
 * @returns At most one edge for each token node, in the order of `resting`.
 */
export function joinEdges(
  from: string,
  route: readonly string[],
  resting: ReadonlySet<string>,
  edges: readonly EdgeEnds[],
): string[] {
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]))
  const routeNodes = [from]
  for (const id of route) {
    const edge = edgeById.get(id)
    if (!edge) return []
    routeNodes.push(edge.source === routeNodes.at(-1) ? edge.target : edge.source)
  }
  const hop = routeNodes[1]
  if (hop === undefined) return []
  return [...resting].flatMap((node) => {
    if (routeNodes.includes(node)) return []
    const edge = edges.find((candidate) => {
      const travel = edgeTravel(candidate, resting)
      return travel.fromNode === node && travel.toNode === hop
    })
    return edge ? [edge.id] : []
  })
}
