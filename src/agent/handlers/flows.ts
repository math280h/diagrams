import { compileFlow } from '@/engine/flow/compile'
import { createFlow, newId } from '@/model/defaults'
import { removeStep } from '@/model/flow'
import type { Flow, FlowPath, Step } from '@/model/schema'
import type { DiagramEdge } from '@/model/types'
import { addFlow, deleteFlow, updateFlow } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { ToolError } from '@/agent/errors'
import { createResolver, resolveFlow, type Resolver } from '@/agent/resolve'
import type { PathInput, ToolInput } from '@/agent/tool-definitions'
import { applyStepInput, buildSteps } from './build'
import { commitEdit, json, openForEdit, stepRangeHint, type ToolHandler } from './common'
import { withWarnings } from '@/agent/warnings'

type FlowOptions = Pick<ToolInput<'add_flow'>, 'token' | 'spotlight' | 'loop' | 'bodies'> & { name?: string }

function applyOptions(flow: Flow, options: FlowOptions) {
  if (options.name !== undefined) flow.name = options.name
  if (options.token?.label !== undefined) flow.token.label = options.token.label
  if (options.token?.icon !== undefined) flow.token.icon = options.token.icon
  if (options.spotlight !== undefined) flow.spotlight = options.spotlight
  if (options.loop !== undefined) flow.loop = options.loop
  if (options.bodies !== undefined) flow.bodies = options.bodies
}

function result(diagramId: string, flowId: string, steps: number, paths: number, warnings: string[]) {
  return json(withWarnings({ diagramId, flowId, steps, ...(paths > 0 ? { paths } : {}) }, warnings))
}

interface BuildContext {
  resolver: Resolver
  edges: readonly DiagramEdge[]
  nodeIds: ReadonlySet<string>
  connect: boolean
  warnings: string[]
}

function buildPaths(steps: readonly Step[], inputs: readonly PathInput[], context: BuildContext): FlowPath[] {
  const timeline = compileFlow({ ...createFlow(), steps: [...steps] }, context.nodeIds, context.edges)
  return inputs.map((input) => {
    const from = steps[input.from]
    if (!from) {
      throw new ToolError(
        `The path "${input.name}" starts after step ${input.from}, but the flow has no such step. ${stepRangeHint(steps.length)}`,
      )
    }
    let rejoinStep: string | null = null
    if (input.rejoin !== undefined) {
      const rejoin = steps[input.rejoin]
      if (!rejoin || input.rejoin <= input.from) {
        throw new ToolError(
          `The path "${input.name}" must rejoin at a main step after step ${input.from}. ${stepRangeHint(steps.length)}`,
        )
      }
      rejoinStep = rejoin.id
    }
    const startNode = timeline.segments.find((segment) => segment.step.id === from.id)?.toNode ?? null
    return {
      id: newId('p'),
      name: input.name,
      fromStep: from.id,
      rejoinStep,
      steps: buildSteps(input.steps, context.resolver, context.edges, context.connect, context.warnings, startNode),
    }
  })
}

function keepValidPaths(flow: Flow, warnings: string[]) {
  if (!flow.paths) return
  const ids = new Set(flow.steps.map((step) => step.id))
  const kept = flow.paths.filter((path) => ids.has(path.fromStep))
  if (kept.length < flow.paths.length) {
    warnings.push(`${flow.paths.length - kept.length} paths started at a step that is gone, so they were removed.`)
  }
  for (const path of kept) if (path.rejoinStep !== null && !ids.has(path.rejoinStep)) path.rejoinStep = null
  flow.paths = kept
}

export const addFlowHandler: ToolHandler<'add_flow'> = async (input, ctx) => {
  const diagramId = await openForEdit(ctx, input.diagramId)
  const doc = useDoc.getState()
  const warnings: string[] = []
  const context: BuildContext = {
    resolver: createResolver(doc.nodes, doc.edges),
    edges: doc.edges,
    nodeIds: new Set(doc.nodes.map((node) => node.id)),
    connect: input.connect ?? true,
    warnings,
  }
  const steps = buildSteps(input.steps, context.resolver, doc.edges, context.connect, warnings)
  const paths = input.paths ? buildPaths(steps, input.paths, context) : []
  const flowId = await commitEdit(ctx, diagramId, () => {
    const flow = addFlow(input.name)
    updateFlow(flow.id, (draft) => {
      draft.steps = steps
      if (paths.length > 0) draft.paths = paths
      applyOptions(draft, input)
    })
    return flow.id
  })
  return result(diagramId, flowId, steps.length, paths.length, warnings)
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
  const removedIds: string[] = []

  if (changes?.replace) {
    steps = buildSteps(changes.replace, resolver, doc.edges, connect, warnings)
  } else if (changes) {
    const missing = (index: number) =>
      new ToolError(`The flow "${flow.name}" has no step ${index}. ${stepRangeHint(steps.length)}`)
    for (const update of changes.update ?? []) {
      const step = steps[update.index]
      if (!step) throw missing(update.index)
      const next = applyStepInput(step, update)
      if (update.target !== undefined) next.target = resolver.target(update.target)
      if (update.parallel !== undefined) {
        const parallel = update.parallel.map((reference) => resolver.target(reference))
        if (parallel.length > 0) next.parallel = parallel
        else delete next.parallel
      }
      steps[update.index] = next
    }
    const removed = [...new Set(changes.remove ?? [])].toSorted((a, b) => b - a)
    for (const index of removed) {
      if (!steps[index]) throw missing(index)
      removedIds.push(steps[index].id)
      steps.splice(index, 1)
    }
    if (changes.append) {
      const nodeIds = new Set(doc.nodes.map((node) => node.id))
      const tokenAt = compileFlow({ ...flow, steps }, nodeIds, doc.edges).segments.at(-1)?.toNode ?? null
      steps.push(...buildSteps(changes.append, resolver, doc.edges, connect, warnings, tokenAt))
    }
  }

  const paths = input.paths
    ? buildPaths(steps, input.paths, {
        resolver,
        edges: doc.edges,
        nodeIds: new Set(doc.nodes.map((node) => node.id)),
        connect,
        warnings,
      })
    : undefined
  let pathCount = 0
  await commitEdit(ctx, diagramId, () =>
    updateFlow(flow.id, (draft) => {
      for (const id of removedIds) removeStep(draft, id)
      draft.steps = steps
      if (paths) draft.paths = paths
      keepValidPaths(draft, warnings)
      if (draft.paths?.length === 0) delete draft.paths
      pathCount = draft.paths?.length ?? 0
      applyOptions(draft, input)
    }),
  )
  return result(diagramId, flow.id, steps.length, pathCount, warnings)
}

export const deleteFlowHandler: ToolHandler<'delete_flow'> = async (input, ctx) => {
  const diagramId = await openForEdit(ctx, input.diagramId)
  const flow = resolveFlow(useDoc.getState().flows, input.flow)
  await commitEdit(ctx, diagramId, () => deleteFlow(flow.id))
  return json({ diagramId, deleted: { id: flow.id, name: flow.name } })
}
