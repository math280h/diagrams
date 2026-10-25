import { compileFlow } from '@/engine/flow/compile'
import type { Flow } from '@/model/schema'
import { addFlow, deleteFlow, updateFlow } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { ToolError } from '@/agent/errors'
import { createResolver, resolveFlow } from '@/agent/resolve'
import type { ToolInput } from '@/agent/tool-definitions'
import { applyStepInput, buildSteps } from './build'
import { commitEdit, json, openForEdit, stepRangeHint, type ToolHandler } from './common'
import { withWarnings } from '@/agent/warnings'

type FlowOptions = Pick<ToolInput<'add_flow'>, 'token' | 'spotlight' | 'loop'> & { name?: string }

function applyOptions(flow: Flow, options: FlowOptions) {
  if (options.name !== undefined) flow.name = options.name
  if (options.token?.label !== undefined) flow.token.label = options.token.label
  if (options.token?.icon !== undefined) flow.token.icon = options.token.icon
  if (options.spotlight !== undefined) flow.spotlight = options.spotlight
  if (options.loop !== undefined) flow.loop = options.loop
}

function result(diagramId: string, flowId: string, steps: number, warnings: string[]) {
  return json(withWarnings({ diagramId, flowId, steps }, warnings))
}

export const addFlowHandler: ToolHandler<'add_flow'> = async (input, ctx) => {
  const diagramId = await openForEdit(ctx, input.diagramId)
  const doc = useDoc.getState()
  const warnings: string[] = []
  const steps = buildSteps(
    input.steps,
    createResolver(doc.nodes, doc.edges),
    doc.edges,
    input.connect ?? true,
    warnings,
  )
  const flowId = await commitEdit(ctx, diagramId, () => {
    const flow = addFlow(input.name)
    updateFlow(flow.id, (draft) => {
      draft.steps = steps
      applyOptions(draft, input)
    })
    return flow.id
  })
  return result(diagramId, flowId, steps.length, warnings)
}

export const updateFlowHandler: ToolHandler<'update_flow'> = async (input, ctx) => {
  const diagramId = await openForEdit(ctx, input.diagramId)
  const doc = useDoc.getState()
  const flow = resolveFlow(doc.flows, input.flow)
  const resolver = createResolver(doc.nodes, doc.edges)
  const connect = input.connect ?? true
  const warnings: string[] = []
  const changes = input.steps
  let steps = [...flow.steps]

  if (changes?.replace) {
    steps = buildSteps(changes.replace, resolver, doc.edges, connect, warnings)
  } else if (changes) {
    const missing = (index: number) =>
      new ToolError(`The flow "${flow.name}" has no step ${index}. ${stepRangeHint(steps.length)}`)
    for (const update of changes.update ?? []) {
      const step = steps[update.index]
      if (!step) throw missing(update.index)
      const next = applyStepInput(step, update)
      steps[update.index] = update.target !== undefined ? { ...next, target: resolver.target(update.target) } : next
    }
    const removed = [...new Set(changes.remove ?? [])].toSorted((a, b) => b - a)
    for (const index of removed) {
      if (!steps[index]) throw missing(index)
      steps.splice(index, 1)
    }
    if (changes.append) {
      const nodeIds = new Set(doc.nodes.map((node) => node.id))
      const tokenAt = compileFlow({ ...flow, steps }, nodeIds, doc.edges).segments.at(-1)?.toNode ?? null
      steps.push(...buildSteps(changes.append, resolver, doc.edges, connect, warnings, tokenAt))
    }
  }

  await commitEdit(ctx, diagramId, () =>
    updateFlow(flow.id, (draft) => {
      draft.steps = steps
      applyOptions(draft, input)
    }),
  )
  return result(diagramId, flow.id, steps.length, warnings)
}

export const deleteFlowHandler: ToolHandler<'delete_flow'> = async (input, ctx) => {
  const diagramId = await openForEdit(ctx, input.diagramId)
  const flow = resolveFlow(useDoc.getState().flows, input.flow)
  await commitEdit(ctx, diagramId, () => deleteFlow(flow.id))
  return json({ diagramId, deleted: { id: flow.id, name: flow.name } })
}
