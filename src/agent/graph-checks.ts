import { findEdgePath } from '@/engine/route'
import { allSteps, stepTargets } from '@/model/flow'
import { nodeLabel } from '@/model/labels'
import { edgeProtocol } from '@/model/protocols'
import type { DiagramEdge, DiagramNode } from '@/model/types'
import { layoutProblems, type DiagramContent } from './compact'

export type GraphQuery = 'incomers' | 'outgoers' | 'neighbours' | 'path'

interface NodeRef {
  id: string
  label: string
}

interface EdgeRef {
  id: string
  label: string
  protocol?: string
}

function nodeRef(node: DiagramNode): NodeRef {
  return { id: node.id, label: nodeLabel(node) }
}

function edgeRef(edge: DiagramEdge): EdgeRef {
  const protocol = edge.data ? edgeProtocol(edge.data) : null
  return { id: edge.id, label: edge.data?.label ?? '', ...(protocol ? { protocol } : {}) }
}

/**
 * Answers a question about the connections of a node.
 *
 * @param toId - With `path`: the node to reach.
 * @returns For `path`, the hops in order with the direction of each edge, or `found: false`. Else the neighbours, each
 *     with the edge that links it and its direction from the node.
 */
export function queryGraph(
  content: Pick<DiagramContent, 'nodes' | 'edges'>,
  query: GraphQuery,
  nodeId: string,
  toId?: string,
) {
  const byId = new Map(content.nodes.map((node) => [node.id, node]))
  const from = byId.get(nodeId)!
  if (query === 'path') {
    const to = toId ? byId.get(toId) : undefined
    if (!to) return { node: nodeRef(from), found: false }
    const route = findEdgePath(from.id, to.id, content.edges)
    if (!route) return { node: nodeRef(from), to: nodeRef(to), found: false }
    const edgeById = new Map(content.edges.map((edge) => [edge.id, edge]))
    let at = from.id
    const hops = route.map((id) => {
      const edge = edgeById.get(id)!
      const along = edge.source === at
      at = along ? edge.target : edge.source
      return { edge: edgeRef(edge), direction: along ? 'along' : 'against', reaches: nodeRef(byId.get(at)!) }
    })
    return { node: nodeRef(from), to: nodeRef(to), found: true, hops }
  }
  const results = content.edges.flatMap((edge) => {
    const outgoing = edge.source === from.id
    const incoming = edge.target === from.id
    if ((query === 'incomers' && !incoming) || (query === 'outgoers' && !outgoing) || (!incoming && !outgoing)) {
      return []
    }
    const other = byId.get(outgoing ? edge.target : edge.source)
    return other ? [{ node: nodeRef(other), edge: edgeRef(edge), direction: outgoing ? 'out' : 'in' }] : []
  })
  return { node: nodeRef(from), results }
}

export type LintRule =
  | 'unlabelled-edge'
  | 'no-technology'
  | 'overlap'
  | 'outside-group'
  | 'unconnected'
  | 'empty-boundary'
  | 'duplicate-label'
  | 'missing-step-target'
  | 'c4-type-badge'
  | 'c4-key'

export interface LintIssue {
  rule: LintRule
  /** `warning` for a problem that readers see, `info` for a choice that is worth a second look. */
  severity: 'warning' | 'info'
  message: string
  nodes?: string[]
  edges?: string[]
}

/** The type badges of C4 elements. A diagram with one of them counts as a C4 diagram. */
const C4_BADGES = new Set(['person', 'software system', 'container', 'component', 'external system'])
const TECHNOLOGY_FORMS = new Set(['service', 'datastore', 'queue'])

function isC4(nodes: readonly DiagramNode[]): boolean {
  return nodes.some((node) => node.type === 'card' && C4_BADGES.has(node.data.badge.trim().toLowerCase()))
}

/** Finds common problems of a diagram that an agent can fix. */
export function lintDiagram(content: Pick<DiagramContent, 'nodes' | 'edges' | 'flows'>): LintIssue[] {
  const { nodes, edges, flows } = content
  const issues: LintIssue[] = []
  const name = (node: DiagramNode) => `"${nodeLabel(node) || node.id}"`
  const byId = new Map(nodes.map((node) => [node.id, node]))

  const unlabelled = edges.filter((edge) => !(edge.data?.label ?? '').trim())
  if (unlabelled.length > 0) {
    issues.push({
      rule: 'unlabelled-edge',
      severity: 'info',
      message: `${unlabelled.length} edge(s) have no label. Name what each one carries or does, for example "HTTPS" or "publishes orders".`,
      edges: unlabelled.map((edge) => edge.id),
    })
  }

  const bare = nodes.filter(
    (node) => node.type === 'card' && TECHNOLOGY_FORMS.has(node.data.form) && node.data.lines.length === 0,
  )
  if (bare.length > 0) {
    issues.push({
      rule: 'no-technology',
      severity: 'warning',
      message: `${bare.length} service, data store or queue card(s) have no line. Add the technology, for example "Go · 3 replicas" or "PostgreSQL 16".`,
      nodes: bare.map((node) => node.id),
    })
  }

  for (const problem of layoutProblems(nodes)) {
    const [a, b] = problem.nodes.map((id) => byId.get(id)!)
    if (problem.kind === 'overlap' && a!.type === 'text' && b!.type === 'text') continue
    issues.push(
      problem.kind === 'overlap'
        ? { rule: 'overlap', severity: 'warning', message: `${name(a!)} overlaps ${name(b!)}.`, nodes: problem.nodes }
        : {
            rule: 'outside-group',
            severity: 'warning',
            message: `${name(a!)} sticks out of its group ${name(b!)}.`,
            nodes: problem.nodes,
          },
    )
  }

  const linked = new Set(edges.flatMap((edge) => [edge.source, edge.target]))
  const loose = nodes.filter((node) => (node.type === 'card' || node.type === 'shape') && !linked.has(node.id))
  if (loose.length > 0) {
    issues.push({
      rule: 'unconnected',
      severity: 'warning',
      message: `${loose.length} node(s) have no edges: ${loose.map(name).join(', ')}. Connect them or remove them.`,
      nodes: loose.map((node) => node.id),
    })
  }

  const parents = new Set(nodes.flatMap((node) => (node.parentId ? [node.parentId] : [])))
  const empty = nodes.filter((node) => node.type === 'group' && !parents.has(node.id))
  if (empty.length > 0) {
    issues.push({
      rule: 'empty-boundary',
      severity: 'info',
      message: `${empty.length} boundary or boundaries hold no nodes: ${empty.map(name).join(', ')}.`,
      nodes: empty.map((node) => node.id),
    })
  }

  const byLabel = new Map<string, DiagramNode[]>()
  for (const node of nodes) {
    if (node.type !== 'card') continue
    const key = nodeLabel(node).trim().toLowerCase()
    if (key) byLabel.set(key, [...(byLabel.get(key) ?? []), node])
  }
  for (const same of byLabel.values()) {
    if (same.length < 2) continue
    issues.push({
      rule: 'duplicate-label',
      severity: 'info',
      message: `${same.length} cards share the label ${name(same[0]!)}. Refer to them by id, or give each one its own label.`,
      nodes: same.map((node) => node.id),
    })
  }

  const edgeIds = new Set(edges.map((edge) => edge.id))
  for (const flow of flows) {
    const gone = allSteps(flow).filter((step) =>
      stepTargets(step).some((target) => !(target.kind === 'node' ? byId.has(target.id) : edgeIds.has(target.id))),
    )
    if (gone.length > 0) {
      issues.push({
        rule: 'missing-step-target',
        severity: 'warning',
        message: `${gone.length} step(s) of the flow "${flow.name}" reach a node or edge that is gone, so the flow skips them. Change or remove them with update_flow.`,
      })
    }
  }

  if (isC4(nodes)) {
    const untyped = nodes.filter((node) => node.type === 'card' && !node.data.badge.trim())
    if (untyped.length > 0) {
      issues.push({
        rule: 'c4-type-badge',
        severity: 'warning',
        message: `${untyped.length} element(s) of this C4 diagram have no type badge. Set badge to Person, Software system, Container, Component or External system.`,
        nodes: untyped.map((node) => node.id),
      })
    }
    const hasKey = nodes.some((node) => node.type === 'text' && /^key\b/i.test(node.data.text.trim()))
    if (!hasKey) {
      issues.push({
        rule: 'c4-key',
        severity: 'warning',
        message:
          'This C4 diagram has no key. Add a text node that starts with "Key:" and explains the badges, borders and lines.',
      })
    }
  }

  return issues
}
