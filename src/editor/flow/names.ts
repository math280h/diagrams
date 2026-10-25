import { nodeTitle as namedTitle } from '@/model/labels'
import type { Step, Target } from '@/model/schema'
import type { DiagramNode } from '@/model/types'
import { useDoc } from '@/store/doc-store'

function nodeTitle(node: DiagramNode | undefined): string {
  return node ? namedTitle(node) : 'Missing node'
}

export function targetName(target: Target): string {
  const { nodes, edges } = useDoc.getState()
  if (target.kind === 'node') return nodeTitle(nodes.find((candidate) => candidate.id === target.id))
  const edge = edges.find((candidate) => candidate.id === target.id)
  if (!edge) return 'Missing connection'
  if (edge.data?.label) return edge.data.label
  const from = nodes.find((node) => node.id === edge.source)
  const to = nodes.find((node) => node.id === edge.target)
  return `${nodeTitle(from)} → ${nodeTitle(to)}`
}

/**
 * Returns the names that a log line shows for a step.
 *
 * @param reversed - True if the token moves from the edge target to the edge source.
 * @returns The element: a node name, or the two node names of an edge in travel order. The event:
 *     the step event, or the edge label if the step has no event.
 */
export function stepLine(step: Step, reversed: boolean): { element: string; event: string } {
  const { nodes, edges } = useDoc.getState()
  if (step.target.kind === 'node') {
    return { element: nodeTitle(nodes.find((candidate) => candidate.id === step.target.id)), event: step.event }
  }
  const edge = edges.find((candidate) => candidate.id === step.target.id)
  if (!edge) return { element: 'Missing connection', event: step.event }
  const from = nodeTitle(nodes.find((node) => node.id === (reversed ? edge.target : edge.source)))
  const to = nodeTitle(nodes.find((node) => node.id === (reversed ? edge.source : edge.target)))
  return { element: `${from} → ${to}`, event: step.event || (edge.data?.label ?? '') }
}
