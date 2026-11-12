import type { Timeline } from '@/engine/flow/compile'
import { findSegment } from '@/engine/flow/sides'
import { MAX_STEP_DURATION_MS, MIN_STEP_DURATION_MS } from '@/model/schema'

const TIME_PATTERN = /^\+?\s*(\d+(?:[.,]\d*)?|[.,]\d+)\s*(ms|s)?$/i

/**
 * Reads a time that a person types: seconds such as `4.1` or `+4.100s`, or milliseconds such as `4100 ms`. The
 * decimal mark can be a point or a comma.
 *
 * @returns The time in whole milliseconds, or `null` if the text is not a time.
 */
export function parseTimeMs(text: string): number | null {
  const match = TIME_PATTERN.exec(text.trim())
  if (!match) return null
  const value = Number(match[1]!.replace(',', '.'))
  return Math.round(match[2]?.toLowerCase() === 'ms' ? value : value * 1000)
}

export interface DurationChange {
  stepId: string
  durationMs: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Returns the duration changes that make a step start at another time. The step before it on its track takes the
 * difference: the previous step of the main track, or the main step where a side path starts.
 *
 * @param startMs - The new start. Each duration stays between {@link MIN_STEP_DURATION_MS} and
 *     {@link MAX_STEP_DURATION_MS}. Past these limits, the step starts at the nearest possible time.
 * @param keepLater - If true, the step itself also takes the difference, so that the later steps keep their start.
 * @returns An empty list if no step comes before the step or the start does not change.
 */
export function startChanges(timeline: Timeline, stepId: string, startMs: number, keepLater = false): DurationChange[] {
  const place = findSegment(timeline, stepId)
  const before = place?.view.segments[place.index - 1]
  if (!place || !before) return []
  const previousMs = before.step.durationMs
  const ownMs = place.segment.step.durationMs
  let deltaMs = clamp(
    startMs - place.segment.startMs,
    MIN_STEP_DURATION_MS - previousMs,
    MAX_STEP_DURATION_MS - previousMs,
  )
  if (keepLater) deltaMs = clamp(deltaMs, ownMs - MAX_STEP_DURATION_MS, ownMs - MIN_STEP_DURATION_MS)
  if (deltaMs === 0) return []
  const changes = [{ stepId: before.step.id, durationMs: previousMs + deltaMs }]
  if (keepLater) changes.push({ stepId, durationMs: ownMs - deltaMs })
  return changes
}
