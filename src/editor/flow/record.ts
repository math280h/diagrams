import { toast } from 'sonner'
import { compileFlow } from '@/engine/flow/compile'
import { findEdgePath } from '@/engine/route'
import { newId } from '@/model/defaults'
import type { Step, Target } from '@/model/schema'
import { updateFlow } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { useUi } from '@/store/ui-store'

export const DEFAULT_NODE_STEP_MS = 1400
export const DEFAULT_EDGE_STEP_MS = 1300

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

function lastTokenNode(flowId: string): string | null {
  const { flows, nodes, edges } = useDoc.getState()
  const flow = flows.find((candidate) => candidate.id === flowId)
  if (!flow) return null
  const timeline = compileFlow(flow, new Set(nodes.map((node) => node.id)), edges)
  return timeline.segments.at(-1)?.toNode ?? null
}

/**
 * Adds steps that move the token from its last node to the node, along the shortest edge chain.
 *
 * If no chain exists, the function adds only a step for the node.
 */
export function appendNodeToFlow(nodeId: string) {
  const flowId = useUi.getState().activeFlowId
  if (!flowId) return
  const from = lastTokenNode(flowId)
  if (from === nodeId) return
  const path = from ? findEdgePath(from, nodeId, useDoc.getState().edges) : []
  if (from && path === null) toast.message('These nodes are not connected, so the token jumps between them.')
  const steps = [
    ...(path ?? []).map((edgeId) => createStep({ kind: 'edge', id: edgeId })),
    createStep({ kind: 'node', id: nodeId }),
  ]
  updateFlow(flowId, (flow) => {
    flow.steps.push(...steps)
  })
  useUi.setState({ selectedStepId: steps.at(-1)!.id })
}

export function appendTargetToFlow(target: Target) {
  const flowId = useUi.getState().activeFlowId
  if (!flowId) return
  const step = createStep(target)
  updateFlow(flowId, (flow) => {
    flow.steps.push(step)
  })
  useUi.setState({ selectedStepId: step.id })
}
