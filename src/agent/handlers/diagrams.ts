import { definedFields } from '@/lib/defined-fields'
import { createDiagram } from '@/model/defaults'
import { deleteDiagram, withFreshIdentity } from '@/persistence/library-actions'
import { setName, setTheme } from '@/store/actions'
import { repository } from '@/persistence/active-repository'
import { untilStored } from '@/persistence/until-stored'
import { errorMessage } from '@/lib/error-message'
import { ToolError } from '@/agent/errors'
import { commitEdit, json, openForEdit, requireDiagram, throwIfCancelled, type ToolHandler } from './common'

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
