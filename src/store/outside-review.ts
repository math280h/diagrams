import { create } from 'zustand'
import { allowsChoice, mergeDiagrams, type MergeChoice, type MergeResult } from '@/model/diagram-merge'
import type { Diagram } from '@/model/schema'

/** The id of the preview that shows the merge of the open diagram and a version from outside. */
export const MERGE_PREVIEW_ID = 'merge'

export interface OutsideReview {
  base: Diagram
  mine: Diagram
  theirs: Diagram
  choices: ReadonlyMap<string, MergeChoice>
  result: MergeResult
}

/** The merge that the review shows over the canvas, or `null` while no review shows. */
export const useOutsideReview = create<{ review: OutsideReview | null }>(() => ({ review: null }))

/**
 * Returns the review of a merge. A choice goes away when the new merge has no conflict with its key, or when the
 * choice does not apply to that conflict.
 *
 * @param choices - The choice for each conflict that the user chose, by conflict key.
 */
export function reviewOf(
  base: Diagram,
  mine: Diagram,
  theirs: Diagram,
  choices: ReadonlyMap<string, MergeChoice> = new Map(),
): OutsideReview {
  const result = mergeDiagrams(base, mine, theirs, choices)
  const kept = new Map(
    result.conflicts.flatMap((conflict) => {
      const choice = choices.get(conflict.key)
      return choice && allowsChoice(conflict, choice) ? [[conflict.key, choice] as const] : []
    }),
  )
  return { base, mine, theirs, choices: kept, result }
}

/** Returns true when the user chose a side for each conflict of the review. */
export function reviewChosen(review: OutsideReview): boolean {
  return review.result.conflicts.every((conflict) => review.choices.has(conflict.key))
}
