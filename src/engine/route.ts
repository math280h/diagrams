import type { EdgeEnds } from './flow/compile'

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
