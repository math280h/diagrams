import { nodeLabel } from '@/model/labels'
import type { Flow, FlowPath, Target } from '@/model/schema'
import type { DiagramEdge, DiagramNode } from '@/model/types'
import { ToolError } from './errors'

const MAX_LISTED = 12
const EDGE_ARROW = '->'

function normalize(text: string) {
  return text.trim().toLowerCase()
}

/** Returns the nodes whose label contains the text, or whose label the text contains. */
function similarNodes(nodes: readonly DiagramNode[], wanted: string) {
  return nodes.filter((candidate) => {
    const text = normalize(nodeLabel(candidate))
    return text.length > 0 && (text.includes(wanted) || wanted.includes(text))
  })
}

function listNodes(nodes: readonly DiagramNode[]) {
  const shown = nodes.slice(0, MAX_LISTED).map((node) => `"${nodeLabel(node)}" (${node.id})`)
  const more = nodes.length > MAX_LISTED ? `, and ${nodes.length - MAX_LISTED} more` : ''
  return nodes.length === 0 ? 'none' : `${shown.join(', ')}${more}`
}

export type Resolver = ReturnType<typeof createResolver>

/**
 * Finds nodes, edges and flow targets from the references an agent gives: ids, refs of the same call or labels.
 *
 * @param refs - Maps the refs of new nodes in the current call to their ids.
 */
export function createResolver(
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[],
  refs: ReadonlyMap<string, string> = new Map(),
) {
  const byId = new Map(nodes.map((candidate) => [candidate.id, candidate]))
  const edgesById = new Map(edges.map((candidate) => [candidate.id, candidate]))
  const label = (id: string) => {
    const found = byId.get(id)
    return found ? `"${nodeLabel(found)}"` : id
  }

  function node(reference: string): DiagramNode {
    const key = reference.trim()
    const direct = byId.get(key) ?? byId.get(refs.get(key) ?? '')
    if (direct) return direct
    const wanted = normalize(reference)
    const matches = nodes.filter((candidate) => normalize(nodeLabel(candidate)) === wanted)
    if (matches.length === 1) return matches[0]!
    if (matches.length > 1) {
      throw new ToolError(`"${reference}" matches ${matches.length} nodes: ${listNodes(matches)}. Use an id.`)
    }
    const similar = similarNodes(nodes, wanted)
    if (similar.length > 0) throw new ToolError(`No node "${reference}". Did you mean ${listNodes(similar)}?`)
    throw new ToolError(`No node "${reference}". Nodes: ${listNodes(nodes)}.`)
  }

  function edge(reference: string): DiagramEdge {
    const direct = edgesById.get(reference.trim())
    if (direct) return direct
    const arrow = reference.indexOf(EDGE_ARROW)
    if (arrow >= 0) {
      const from = node(reference.slice(0, arrow))
      const to = node(reference.slice(arrow + EDGE_ARROW.length))
      const matches = edges.filter((candidate) => candidate.source === from.id && candidate.target === to.id)
      if (matches.length === 1) return matches[0]!
      if (matches.length > 1) {
        throw new ToolError(`${matches.length} edges go from ${label(from.id)} to ${label(to.id)}. Use an edge id.`)
      }
      const reverse = edges.some((candidate) => candidate.source === to.id && candidate.target === from.id)
      throw new ToolError(
        `No edge goes from ${label(from.id)} to ${label(to.id)}.${reverse ? ' One goes the other way.' : ''}`,
      )
    }
    const wanted = normalize(reference)
    const matches = edges.filter((candidate) => normalize(candidate.data?.label ?? '') === wanted)
    if (matches.length === 1) return matches[0]!
    const shown = matches.length > 0 ? matches : edges
    const list = shown
      .slice(0, MAX_LISTED)
      .map((candidate) => `${label(candidate.source)} -> ${label(candidate.target)} (${candidate.id})`)
      .join(', ')
    if (matches.length > 1) throw new ToolError(`"${reference}" matches ${matches.length} edges: ${list}.`)
    throw new ToolError(`No edge "${reference}". Edges: ${list || 'none'}.`)
  }

  function target(reference: string): Target {
    if (reference.includes(EDGE_ARROW)) return { kind: 'edge', id: edge(reference).id }
    try {
      return { kind: 'node', id: node(reference).id }
    } catch (nodeError) {
      if (edgesById.has(reference.trim())) return { kind: 'edge', id: reference.trim() }
      const byLabel = edges.filter((candidate) => normalize(candidate.data?.label ?? '') === normalize(reference))
      if (byLabel.length === 1) return { kind: 'edge', id: byLabel[0]!.id }
      throw nodeError
    }
  }

  return { node, edge, target }
}

/** Finds a flow by id or by name. */
/**
 * Finds a path of a flow by its id or its name.
 *
 * @throws ToolError If no path or more than one path matches.
 */
export function resolvePath(flow: Flow, reference: string): FlowPath {
  const paths = flow.paths ?? []
  const direct = paths.find((path) => path.id === reference)
  if (direct) return direct
  const matches = paths.filter((path) => normalize(path.name) === normalize(reference))
  if (matches.length === 1) return matches[0]!
  const list = paths.map((path) => `"${path.name}" (${path.id})`).join(', ') || 'none'
  if (matches.length > 1) throw new ToolError(`"${reference}" matches ${matches.length} paths: ${list}. Use an id.`)
  throw new ToolError(`The flow "${flow.name}" has no path "${reference}". Paths: ${list}.`)
}

export function resolveFlow(flows: readonly Flow[], reference: string): Flow {
  const direct = flows.find((flow) => flow.id === reference)
  if (direct) return direct
  const matches = flows.filter((flow) => normalize(flow.name) === normalize(reference))
  if (matches.length === 1) return matches[0]!
  const list = flows.map((flow) => `"${flow.name}" (${flow.id})`).join(', ') || 'none'
  if (matches.length > 1) throw new ToolError(`"${reference}" matches ${matches.length} flows: ${list}. Use an id.`)
  throw new ToolError(`No flow "${reference}". Flows: ${list}.`)
}
