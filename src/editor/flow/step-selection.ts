import type { MouseEvent } from 'react'
import { pathSteps, removeStep, sidePaths } from '@/model/flow'
import { selectOnly, updateFlow } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { setUi, useUi } from '@/store/ui-store'

export interface StepClick {
  /** Adds the step to the selection, or removes it. */
  toggle: boolean
  /** Selects the steps from the last selected step to this step. */
  range: boolean
}

/**
 * Returns the step selection after a click on a step.
 *
 * @param selected - The selected step ids. A range starts at the last one, and that step stays last.
 * @param order - The step ids in the order of the list.
 */
export function clickedSelection(
  selected: readonly string[],
  stepId: string,
  order: readonly string[],
  { toggle, range }: StepClick,
): string[] {
  const anchor = selected.at(-1)
  const from = anchor === undefined ? -1 : order.indexOf(anchor)
  const to = order.indexOf(stepId)
  if (range && anchor !== undefined && from !== -1 && to !== -1) {
    const span = order.slice(Math.min(from, to), Math.max(from, to) + 1).filter((id) => id !== anchor)
    const kept = toggle ? selected.filter((id) => id !== anchor && !span.includes(id)) : []
    return [...kept, ...span, anchor]
  }
  if (toggle) return selected.includes(stepId) ? selected.filter((id) => id !== stepId) : [...selected, stepId]
  return [stepId]
}

/**
 * Selects a step after a click on it in a list of steps. Shift selects a range, Ctrl or Cmd adds or removes the step.
 *
 * @param order - The step ids in the order of the list.
 * @returns True for a click without Shift, Ctrl or Cmd.
 */
export function selectClickedStep(event: MouseEvent, stepId: string, order: readonly string[]): boolean {
  const click = { toggle: event.metaKey || event.ctrlKey, range: event.shiftKey }
  selectOnly([])
  setUi({ selectedStepIds: clickedSelection(useUi.getState().selectedStepIds, stepId, order, click) })
  return !click.toggle && !click.range
}

/**
 * Selects a step before its context menu opens, and clears the canvas selection. If the step is in the selection, the
 * selection does not change.
 */
export function selectStepForMenu(stepId: string) {
  selectOnly([])
  if (!useUi.getState().selectedStepIds.includes(stepId)) setUi({ selectedStepIds: [stepId] })
}

/** Returns the id of the selected step, or `null` when no step or more than one step is selected. */
export function useSelectedStepId(): string | null {
  return useUi((state) => (state.selectedStepIds.length === 1 ? state.selectedStepIds[0]! : null))
}

/** Selects every step that the active flow plays on the active path, and the steps of the side paths that play. */
export function selectAllSteps() {
  const { activeFlowId, activePathId } = useUi.getState()
  const flow = useDoc.getState().flows.find((candidate) => candidate.id === activeFlowId)
  if (!flow) return
  const steps = pathSteps(flow, activePathId)
  const played = new Set(steps.map((step) => step.id))
  const sides = sidePaths(flow).filter((path) => played.has(path.fromStep))
  selectOnly([])
  setUi({ selectedStepIds: [...steps, ...sides.flatMap((path) => path.steps)].map((step) => step.id) })
}

/**
 * Deletes the selected steps of the active flow in one undo step.
 *
 * @returns False, and deletes nothing, when the flow panel is closed, no step is selected, or a node or a connection
 * is selected.
 */
export function deleteSelectedSteps(): boolean {
  const { flowPanelOpen, activeFlowId, selectedStepIds } = useUi.getState()
  const { flows, nodes, edges } = useDoc.getState()
  const flow = flows.find((candidate) => candidate.id === activeFlowId)
  if (!flowPanelOpen || !flow || selectedStepIds.length === 0) return false
  if (nodes.some((node) => node.selected) || edges.some((edge) => edge.selected)) return false
  updateFlow(flow.id, (draft) => {
    for (const id of selectedStepIds) removeStep(draft, id)
  })
  setUi({ selectedStepIds: [] })
  return true
}
