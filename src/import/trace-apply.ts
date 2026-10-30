import { placeNodes, type LayoutFunction } from '@/agent/placement'
import type { IconSet } from '@/canvas/icons/library'
import { createDiagram } from '@/model/defaults'
import type { Diagram, Flow } from '@/model/schema'
import type { DiagramEdge, DiagramNode } from '@/model/types'
import { toStoredEdge, toStoredNode } from '@/persistence/serialize'
import { addFlow, addNodes, fitGroupsToChildren, updateFlow } from '@/store/actions'
import { walkTrace, type Trace } from './trace'
import { planTraceFlow, type TraceFlowPlan } from './trace-flow'

export interface PlacedTraceFlow {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  /** The groups of the diagram that got new nodes. */
  containers: string[]
  flow: Flow
}

/** Makes a new diagram with a card for each part of the system that the trace reaches, and the trace as its flow. */
export async function traceToDiagram(
  trace: Trace,
  iconSets: readonly IconSet[],
  layout: LayoutFunction,
  name?: string,
): Promise<Diagram> {
  const plan = planTraceFlow(walkTrace(trace), { nodes: [], edges: [] }, iconSets)
  const laidOut = await layout(plan.nodes, plan.edges, 'RIGHT')
  return {
    ...createDiagram(name || plan.flow.name),
    nodes: laidOut.nodes.map(toStoredNode),
    edges: laidOut.edges.map(toStoredEdge).filter((edge) => edge !== null),
    flows: [plan.flow],
  }
}

/** Gives the new cards of a plan positions next to the cards that they connect to. */
export async function placeTraceFlow(
  plan: TraceFlowPlan,
  diagram: { nodes: DiagramNode[]; edges: DiagramEdge[] },
  layout: LayoutFunction,
): Promise<PlacedTraceFlow> {
  const placed = await placeNodes({
    existing: diagram.nodes,
    added: plan.nodes,
    fixed: new Set(),
    edges: [...diagram.edges, ...plan.edges],
    direction: 'RIGHT',
    layout,
  })
  const edges = plan.edges.map((edge): DiagramEdge => {
    const route = placed.routes.get(edge.id)
    return route && edge.data ? { ...edge, data: { ...edge.data, route } } : edge
  })
  return { nodes: placed.added, edges, containers: placed.containers, flow: plan.flow }
}

/**
 * Adds the new cards, edges and flow to the open diagram.
 *
 * @returns The id of the new flow.
 */
export function addTraceFlow(placed: PlacedTraceFlow): string {
  addNodes(placed.nodes, placed.edges, false)
  fitGroupsToChildren(placed.containers)
  const { id } = addFlow(placed.flow.name)
  updateFlow(id, (draft) => {
    draft.steps = placed.flow.steps
    draft.token = placed.flow.token
  })
  return id
}
