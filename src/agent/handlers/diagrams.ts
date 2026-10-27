import { definedFields } from '@/lib/defined-fields'
import { addTraceFlow, placeTraceFlow, traceToDiagram } from '@/import/trace-apply'
import { parseTraces, TraceImportError, walkTrace, type Trace } from '@/import/trace'
import { planTraceFlow } from '@/import/trace-flow'
import { nodeLabel } from '@/model/labels'
import { useDoc } from '@/store/doc-store'
import { withWarnings } from '@/agent/warnings'
import { createDiagram } from '@/model/defaults'
import { deleteDiagram, withFreshIdentity } from '@/persistence/library-actions'
import { setName, setTheme } from '@/store/actions'
import { repository } from '@/persistence/active-repository'
import { untilStored } from '@/persistence/until-stored'
import { errorMessage } from '@/lib/error-message'
import { ToolError } from '@/agent/errors'
import { commitEdit, json, openForEdit, requireDiagram, throwIfCancelled, type ToolHandler } from './common'

const CHECK_HINT = 'Call render_image with the flow and a step to check the result.'

async function store(diagram: ReturnType<typeof createDiagram>) {
  const failure = await untilStored(diagram.id, () => repository().save(diagram))
  if (failure !== null) throw new ToolError(`The diagram could not be saved: ${failure}`)
}

export const createDiagramHandler: ToolHandler<'create_diagram'> = async ({ name, template }, ctx) => {
  let diagram = createDiagram(name)
  if (template !== undefined) {
    const source = ctx.templates.find((candidate) => candidate.id === template)
    if (!source) {
      const ids = ctx.templates.map((candidate) => `"${candidate.id}"`).join(', ')
      throw new ToolError(`No template "${template}". Templates: ${ids}.`)
    }
    diagram = withFreshIdentity(source.build(), name)
  }
  throwIfCancelled(ctx)
  await store(diagram)
  await ctx.openInEditor(diagram.id)
  return json({ diagramId: diagram.id, name: diagram.name, nodes: diagram.nodes.length, flows: diagram.flows.length })
}

export const openDiagramHandler: ToolHandler<'open_diagram'> = async ({ diagramId }, ctx) => {
  const meta = requireDiagram(diagramId)
  await ctx.openInEditor(diagramId)
  return json({ diagramId, name: meta.name })
}

export const updateDiagram: ToolHandler<'update_diagram'> = async ({ diagramId, name, theme }, ctx) => {
  const id = await openForEdit(ctx, diagramId)
  await commitEdit(ctx, id, () => {
    if (name !== undefined) setName(name)
    if (theme) setTheme(definedFields(theme))
  })
  return json({ diagramId: id, updated: true })
}

export const deleteDiagramHandler: ToolHandler<'delete_diagram'> = async ({ diagramId }, ctx) => {
  const meta = requireDiagram(diagramId)
  throwIfCancelled(ctx)
  if (ctx.openDiagramId() === diagramId) await ctx.goHome()
  const failure = await untilStored(diagramId, () => deleteDiagram(diagramId))
  if (failure !== null) throw new ToolError(`The diagram could not be deleted: ${failure}`)
  return json({ deleted: { id: diagramId, name: meta.name } })
}

export const importMermaid: ToolHandler<'import_mermaid'> = async ({ source, name }, ctx) => {
  let diagram
  try {
    diagram = await ctx.mermaidToDiagram(source, name)
  } catch (error) {
    throw new ToolError(`The Mermaid text could not be imported: ${errorMessage(error)}`)
  }
  throwIfCancelled(ctx)
  await store(diagram)
  await ctx.openInEditor(diagram.id)
  return json({ diagramId: diagram.id, name: diagram.name, nodes: diagram.nodes.length, edges: diagram.edges.length })
}

function readTrace(source: string): { trace: Trace; warnings: string[] } {
  let traces: Trace[]
  try {
    traces = parseTraces(source)
  } catch (error) {
    if (error instanceof TraceImportError) throw new ToolError(error.message)
    throw error
  }
  const trace = traces[0]!
  const warnings =
    traces.length > 1
      ? [
          `The text holds ${traces.length} traces. The tool imported the one with the most spans (${trace.spans.length}).`,
        ]
      : []
  return { trace, warnings }
}

export const importTrace: ToolHandler<'import_trace'> = async ({ trace: source, diagramId, name }, ctx) => {
  const { trace, warnings } = readTrace(source)
  const iconSets = await ctx.iconSets().catch(() => [])
  if (diagramId === undefined) {
    const diagram = await traceToDiagram(trace, iconSets, ctx.layout, name)
    throwIfCancelled(ctx)
    await store(diagram)
    await ctx.openInEditor(diagram.id)
    const flow = diagram.flows[0]!
    return json(
      withWarnings(
        {
          diagramId: diagram.id,
          name: diagram.name,
          flowId: flow.id,
          steps: flow.steps.length,
          nodes: diagram.nodes.length,
          edges: diagram.edges.length,
          hint: CHECK_HINT,
        },
        warnings,
      ),
    )
  }
  const id = await openForEdit(ctx, diagramId)
  const doc = useDoc.getState()
  const plan = planTraceFlow(walkTrace(trace), doc, iconSets)
  const placed = await placeTraceFlow(plan, doc, ctx.layout)
  const flowId = await commitEdit(ctx, id, () => addTraceFlow(placed))
  return json(
    withWarnings(
      {
        diagramId: id,
        flowId,
        steps: plan.flow.steps.length,
        matchedCards: plan.matched,
        newCards: placed.nodes.map((node) => ({ id: node.id, label: nodeLabel(node) })),
        newEdges: plan.edges.length,
        hint: CHECK_HINT,
      },
      warnings,
    ),
  )
}
