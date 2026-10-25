import { nodeName } from './labels'
import type { Diagram, Flow, StoredEdge, StoredNode } from './schema'

const MAX_NAMED_NODES = 3
const MAX_NAME_LENGTH = 32

const FALLBACK_NAMES: Record<StoredNode['type'], string> = {
  card: 'an untitled node',
  shape: 'an untitled shape',
  text: 'an empty text',
  group: 'an untitled boundary',
}

function summaryName(node: StoredNode): string {
  const text = nodeName(node) || FALLBACK_NAMES[node.type]
  return text.length > MAX_NAME_LENGTH ? `${text.slice(0, MAX_NAME_LENGTH - 1).trimEnd()}…` : text
}

function same(a: unknown, b: unknown) {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

function moved(before: StoredNode, after: StoredNode) {
  return (
    before.position.x !== after.position.x ||
    before.position.y !== after.position.y ||
    before.width !== after.width ||
    before.height !== after.height ||
    before.parentId !== after.parentId
  )
}

function edgeChanged(before: StoredEdge, after: StoredEdge) {
  return (
    before.source !== after.source ||
    before.target !== after.target ||
    before.sourceHandle !== after.sourceHandle ||
    before.targetHandle !== after.targetHandle ||
    !same(before.data, after.data)
  )
}

interface Split<T> {
  added: T[]
  removed: T[]
  common: [T, T][]
}

function split<T extends { id: string }>(before: readonly T[], after: readonly T[]): Split<T> {
  const old = new Map(before.map((item) => [item.id, item]))
  const kept = new Set<string>()
  const added: T[] = []
  const common: [T, T][] = []
  for (const item of after) {
    const previous = old.get(item.id)
    if (previous) {
      common.push([previous, item])
      kept.add(item.id)
    } else {
      added.push(item)
    }
  }
  return { added, removed: before.filter((item) => !kept.has(item.id)), common }
}

function count(amount: number, one: string, many: string) {
  return amount === 1 ? one : `${amount} ${many}`
}

function nodeItems(nodes: readonly StoredNode[]): string[] {
  if (nodes.length === 0) return []
  if (nodes.length > MAX_NAMED_NODES) return [`${nodes.length} nodes`]
  return nodes.map(summaryName)
}

function joinItems(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

function flowName(name: string) {
  return `the “${name || 'Untitled'}” flow`
}

/** Returns a short description of the content of a diagram, such as "12 nodes, 9 connections and 2 flows". */
export function describeContent(diagram: Diagram): string {
  const parts = [count(diagram.nodes.length, '1 node', 'nodes')]
  if (diagram.edges.length > 0) parts.push(count(diagram.edges.length, '1 connection', 'connections'))
  if (diagram.flows.length > 0) parts.push(count(diagram.flows.length, '1 flow', 'flows'))
  return joinItems(parts)
}

/**
 * Describes what changed between two versions of a diagram, in one or more short sentences.
 *
 * @example "Added Redis and a connection. Moved 4 nodes."
 */
export function describeChange(before: Diagram, after: Diagram): string {
  const nodes = split(before.nodes, after.nodes)
  const edges = split(before.edges, after.edges)
  const flows = split(before.flows, after.flows)
  const changedNodes: StoredNode[] = []
  const movedNodes: StoredNode[] = []
  for (const [a, b] of nodes.common) {
    if (a.type !== b.type || !same(a.data, b.data)) changedNodes.push(b)
    else if (moved(a, b)) movedNodes.push(b)
  }
  const changedEdges = edges.common.filter(([a, b]) => edgeChanged(a, b))
  const changedFlows = flows.common.filter(([a, b]) => !same(a, b)).map(([, b]) => b)

  const sentences: string[] = []
  const add = (verb: string, nodeList: readonly StoredNode[], edgeCount = 0, flowList: readonly Flow[] = []) => {
    const items = [
      ...nodeItems(nodeList),
      ...(edgeCount > 0 ? [count(edgeCount, 'a connection', 'connections')] : []),
      ...flowList.map((flow) => flowName(flow.name)),
    ]
    if (items.length > 0) sentences.push(`${verb} ${joinItems(items)}.`)
  }
  add('Added', nodes.added, edges.added.length, flows.added)
  add('Removed', nodes.removed, edges.removed.length, flows.removed)
  add('Changed', changedNodes, changedEdges.length, changedFlows)
  add('Moved', movedNodes)
  if (before.name !== after.name) sentences.push(`Renamed the diagram to “${after.name}”.`)
  if (!same(before.theme, after.theme)) sentences.push('Changed the style.')
  return sentences.length > 0 ? sentences.join(' ') : 'No visible changes.'
}
