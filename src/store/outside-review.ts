import { create } from 'zustand'
import { mergeDiagrams, type MergeResult, type MergeSide } from '@/model/diagram-merge'
import type { Diagram } from '@/model/schema'

/** The id of the preview that shows the merge of the open diagram and a version from outside. */
export const MERGE_PREVIEW_ID = 'merge'

export interface OutsideReview {
  base: Diagram
  mine: Diagram
  theirs: Diagram
  choices: ReadonlyMap<string, MergeSide>
  result: MergeResult
}

/** The merge that the review shows over the canvas, or `null` while no review shows. */
export const useOutsideReview = create<{ review: OutsideReview | null }>(() => ({ review: null }))

/**
 * Returns the review of a merge. The choices for conflicts that the new merge no longer has go away.
 *
 * @param choices - The side for each conflict that the user chose, by conflict key.
 */
export function reviewOf(
  base: Diagram,
  mine: Diagram,
  theirs: Diagram,
  choices: ReadonlyMap<string, MergeSide> = new Map(),
): OutsideReview {
  const result = mergeDiagrams(base, mine, theirs, choices)
  const keys = new Set(result.conflicts.map((conflict) => conflict.key))
  return { base, mine, theirs, choices: new Map([...choices].filter(([key]) => keys.has(key))), result }
}

/** Returns true when the user chose a side for each conflict of the review. */
export function reviewChosen(review: OutsideReview): boolean {
  return review.result.conflicts.every((conflict) => review.choices.has(conflict.key))
}
