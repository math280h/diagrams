import { lanesText, stepTargets, type LaneName } from '@/model/flow'
import { nodeTitle as namedTitle } from '@/model/labels'
import { stepBody } from '@/model/payload'
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
 * @param lanes - The targets of the step with their travel direction, the main target first. Without them, each edge
 *     goes along its direction.
 * @returns The element: the node names and the edge ends in travel order, see {@link lanesText}. The event: the step
 *     event, or the label of the main edge if the step has no event. The body: for an edge step, the request body of
 *     the main edge as compact JSON, or the response body if the token moves back. It is empty without such a body.
 */
export function stepLine(
  step: Step,
  lanes: readonly { target: Target; reversed: boolean }[] = stepTargets(step).map((target) => ({
    target,
    reversed: false,
  })),
): { element: string; event: string; body: string } {
  const { nodes, edges } = useDoc.getState()
  const nodeName = (id: string) => nodeTitle(nodes.find((candidate) => candidate.id === id))
  const names = lanes.map(({ target, reversed }): LaneName => {
    if (target.kind === 'node') return { kind: 'node', from: nodeName(target.id), to: '' }
    const edge = edges.find((candidate) => candidate.id === target.id)
    if (!edge) return { kind: 'node', from: 'Missing connection', to: '' }
    return {
      kind: 'edge',
      from: nodeName(reversed ? edge.target : edge.source),
      to: nodeName(reversed ? edge.source : edge.target),
    }
  })
  const main = lanes[0]
  const mainEdge = main?.target.kind === 'edge' ? edges.find((candidate) => candidate.id === main.target.id) : undefined
  return {
    element: lanesText(names),
    event: step.event || (mainEdge?.data?.label ?? ''),
    body: mainEdge ? stepBody(mainEdge.data, main!.reversed) : '',
  }
}
