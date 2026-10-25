import type { ToolContent } from '@/desktop/contract'
import { repository } from '@/persistence/active-repository'
import { fromDiagram } from '@/persistence/serialize'
import { untilStored } from '@/persistence/until-stored'
import { takeSnapshot, useDoc } from '@/store/doc-store'
import { flushPendingSave } from '@/store/document'
import { oneStep } from '@/store/history'
import { asVersionAuthor } from '@/store/versions'
import { errorMessage } from '@/lib/error-message'
import type { DiagramContent } from '@/agent/compact'
import type { HandlerContext } from '@/agent/context'
import { ToolError } from '@/agent/errors'
import type { ToolInput, ToolName } from '@/agent/tool-definitions'

export type ToolHandler<N extends ToolName> = (input: ToolInput<N>, ctx: HandlerContext) => Promise<ToolContent[]>

export function json(value: unknown): ToolContent[] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

/** Returns true if the editor shows the diagram and the document store holds it. */
export function editorShows(ctx: HandlerContext, id: string) {
  return ctx.openDiagramId() === id && useDoc.getState().id === id
}

/** Returns the given diagram id, or the id of the diagram in the editor. */
export function targetDiagramId(ctx: HandlerContext, id: string | undefined): string {
  const resolved = id ?? ctx.openDiagramId()
  if (!resolved) {
    throw new ToolError(
      'No diagram is open in the editor. Give a diagramId from list_diagrams, or call create_diagram.',
    )
  }
  return resolved
}

export function requireDiagram(id: string) {
  const meta = repository()
    .list()
    .find((entry) => entry.id === id)
  if (!meta) throw new ToolError(`No diagram has the id "${id}". Call list_diagrams to see the ids.`)
  return meta
}

/** Opens the diagram in the editor for a change and returns its id. */
export async function openForEdit(ctx: HandlerContext, id: string | undefined): Promise<string> {
  const diagramId = targetDiagramId(ctx, id)
  requireDiagram(diagramId)
  await ctx.openInEditor(diagramId)
  return diagramId
}

/** Returns the sentence that tells an agent which step indexes a flow with `count` steps has. */
export function stepRangeHint(count: number): string {
  return count === 0 ? 'It has no steps.' : `Use a step index from 0 to ${count - 1}.`
}

/** Throws a ToolError if the client cancelled the call or its time limit ended. */
export function throwIfCancelled(ctx: HandlerContext) {
  if (ctx.signal.aborted) throw new ToolError('The request was cancelled, so the tool made no change.')
}

/**
 * Applies a change to the open diagram as one undo step, saves it and waits until the save reaches storage.
 *
 * @throws ToolError If the client cancelled the call, if the editor no longer shows the diagram, or if the save failed. After
 *   a failed save the change stays in the editor.
 */
export async function commitEdit<T>(ctx: HandlerContext, diagramId: string, change: () => T): Promise<T> {
  throwIfCancelled(ctx)
  if (!editorShows(ctx, diagramId)) {
    throw new ToolError('The editor no longer shows this diagram, so the tool made no change. Call the tool again.')
  }
  let result: T | undefined
  const failure = await untilStored(diagramId, () => {
    result = asVersionAuthor({ author: 'agent', tool: ctx.toolTitle }, () => {
      const value = oneStep(change)
      flushPendingSave()
      return value
    })
  })
  if (failure !== null) {
    throw new ToolError(`The change shows in the editor, but it did not save: ${failure}. Tell the user.`)
  }
  return result as T
}

/** Returns the diagram from the editor if it shows it, or else from storage. */
export function diagramContent(ctx: HandlerContext, id: string): DiagramContent {
  if (editorShows(ctx, id)) return { id, ...takeSnapshot() }
  requireDiagram(id)
  let diagram
  try {
    diagram = repository().load(id)
  } catch (error) {
    throw new ToolError(`The diagram "${id}" cannot be read: ${errorMessage(error)}`)
  }
  if (!diagram) throw new ToolError(`No diagram has the id "${id}".`)
  const { nodes, edges } = fromDiagram(diagram)
  return { id, name: diagram.name, theme: diagram.theme, nodes, edges, flows: diagram.flows }
}
