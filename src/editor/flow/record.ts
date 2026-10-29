import { toast } from 'sonner'
import { compileFlow, type Timeline } from '@/engine/flow/compile'
import { findEdgePath } from '@/engine/route'
import { newId } from '@/model/defaults'
import { findPath } from '@/model/flow'
import type { Flow, Step, Target } from '@/model/schema'
import { updateFlow } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { useUi } from '@/store/ui-store'

export const DEFAULT_NODE_STEP_MS = 1400
export const DEFAULT_EDGE_STEP_MS = 1300
export const DEFAULT_OVERVIEW_STEP_MS = 2400

/** Returns a step that shows the whole flow, as an introduction or a conclusion. */
export function createOverviewStep(caption = ''): Step {
  return {
    id: newId('s'),
    target: { kind: 'flow', id: '' },
    caption,
    durationMs: DEFAULT_OVERVIEW_STEP_MS,
    camera: 'fit',
    zoom: 1,
    event: '',
    latencyMs: null,
    level: 'info',
  }
}

export function createStep(target: Target, caption = ''): Step {
  return {
    id: newId('s'),
    target,
    caption,
    durationMs: target.kind === 'node' ? DEFAULT_NODE_STEP_MS : DEFAULT_EDGE_STEP_MS,
    camera: 'follow',
    zoom: 1.1,
    event: '',
    latencyMs: null,
    level: 'info',
  }
}

interface Recording {
  flowId: string
  pathId: string | null
  steps: Step[]
  timeline: Timeline
}

function recording(): Recording | null {
  const { activeFlowId, activePathId } = useUi.getState()
  const { flows, nodes, edges } = useDoc.getState()
  const flow = flows.find((candidate) => candidate.id === activeFlowId)
  if (!flow) return null
  const path = findPath(flow, activePathId)
  return {
    flowId: flow.id,
    pathId: path?.id ?? null,
    steps: path ? path.steps : flow.steps,
    timeline: compileFlow(flow, new Set(nodes.map((node) => node.id)), edges, path?.id ?? null),
  }
}

function lastMovingStep(steps: Step[]): Step | undefined {
  return steps.findLast((step) => step.target.kind !== 'flow')
}

function insertIndex(steps: Step[]): number {
  return steps.length > 1 && steps.at(-1)!.target.kind === 'flow' ? steps.length - 1 : steps.length
}

function lastTokenNode({ steps, timeline, pathId }: Recording): string | null {
  const lastId = lastMovingStep(steps)?.id ?? (pathId ? findPath(timeline.flow, pathId)?.fromStep : undefined)
  const segment = lastId
    ? timeline.segments.find((candidate) => candidate.step.id === lastId)
    : timeline.segments.at(-1)
  return segment?.toNode ?? null
}

function editSteps({ flowId, pathId }: Recording, recipe: (steps: Step[]) => void) {
  updateFlow(flowId, (flow: Flow) => {
    const path = findPath(flow, pathId)
    recipe(path ? path.steps : flow.steps)
  })
}

/**
 * Adds steps that move the token from its last node to the node, along the shortest edge chain.
 *
 * If no chain exists, the function adds only a step for the node. With an active path, the steps join the path.
 */
export function appendNodeToFlow(nodeId: string) {
  const current = recording()
  if (!current) return
  const from = lastTokenNode(current)
  if (from === nodeId) return
  const path = from ? findEdgePath(from, nodeId, useDoc.getState().edges) : []
  if (from && path === null) toast.message('These nodes are not connected, so the token jumps between them.')
  const steps = [
    ...(path ?? []).map((edgeId) => createStep({ kind: 'edge', id: edgeId })),
    createStep({ kind: 'node', id: nodeId }),
  ]
  editSteps(current, (list) => void list.splice(insertIndex(list), 0, ...steps))
  useUi.setState({ selectedStepId: steps.at(-1)!.id })
}

export function appendTargetToFlow(target: Target) {
  const current = recording()
  if (!current) return
  const step = createStep(target)
  editSteps(current, (list) => void list.splice(insertIndex(list), 0, step))
  useUi.setState({ selectedStepId: step.id })
}

function addParallel(step: Step, target: Target) {
  if (step.target.kind === target.kind && step.target.id === target.id) return
  if (step.parallel?.some((candidate) => candidate.kind === target.kind && candidate.id === target.id)) return
  step.parallel = [...(step.parallel ?? []), target]
}

/**
 * Makes the last recorded step also reach the node, at the same time as its own target.
 *
 * After an edge step and a node step, the edge from the same source node to this node joins the edge step, and the
 * node joins the node step. Without an earlier step, the node becomes the first step.
 */
export function appendParallelNode(nodeId: string) {
  const current = recording()
  if (!current) return
  const moving = current.steps.filter((step) => step.target.kind !== 'flow')
  const last = moving.at(-1)
  if (!last) return appendNodeToFlow(nodeId)
  const segmentOf = (step: Step | undefined) =>
    step ? current.timeline.segments.find((candidate) => candidate.step.id === step.id) : undefined
  const { edges } = useDoc.getState()
  const edgeStep = last.target.kind === 'edge' ? last : moving.at(-2)
  const source = edgeStep?.target.kind === 'edge' ? segmentOf(edgeStep)?.fromNode : null
  const route = source ? findEdgePath(source, nodeId, edges) : null
  const edgeId = route?.length === 1 ? route[0]! : null
  if (!edgeId) toast.message('No connection reaches this node from the same node, so its token starts on the node.')
  editSteps(current, (list) => {
    const lastDraft = list.find((step) => step.id === last.id)
    const edgeDraft = edgeStep && list.find((step) => step.id === edgeStep.id)
    if (edgeId && edgeDraft) addParallel(edgeDraft, { kind: 'edge', id: edgeId })
    if (lastDraft?.target.kind === 'node') addParallel(lastDraft, { kind: 'node', id: nodeId })
  })
  useUi.setState({ selectedStepId: last.id })
}
