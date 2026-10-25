import type { CameraKeyframe, ValueKeyframe } from '@/model/schema'
import { blendCameras, type Camera, type ViewSize } from '@/engine/camera'
import { applyEase, clamp01, lerp } from '@/engine/easing'

function bracket<K extends { atMs: number }>(keyframes: readonly K[], timeMs: number): [K, K, number] | null {
  if (keyframes.length === 0) return null
  const sorted = keyframes.toSorted((a, b) => a.atMs - b.atMs)
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  if (timeMs <= first.atMs) return [first, first, 0]
  if (timeMs >= last.atMs) return [last, last, 0]
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!
    const b = sorted[i + 1]!
    if (timeMs >= a.atMs && timeMs <= b.atMs) {
      const span = b.atMs - a.atMs
      return [a, b, span > 0 ? (timeMs - a.atMs) / span : 1]
    }
  }
  return [last, last, 0]
}

/**
 * Returns the track value at the time.
 *
 * Before the first keyframe the value is the first value. After the last keyframe the value is the
 * last value. The ease of a keyframe controls the change to the next keyframe.
 *
 * @returns The value, or `null` if the track has no keyframes.
 */
export function sampleValueTrack(keyframes: readonly ValueKeyframe[], timeMs: number): number | null {
  const found = bracket(keyframes, timeMs)
  if (!found) return null
  const [a, b, t] = found
  return lerp(a.value, b.value, applyEase(a.ease, clamp01(t)))
}

/**
 * Returns the camera of a camera track at the time.
 *
 * @returns The camera, or `null` before the first keyframe.
 */
export function sampleCameraTrack(keyframes: readonly CameraKeyframe[], timeMs: number, view: ViewSize): Camera | null {
  const found = bracket(keyframes, timeMs)
  if (!found) return null
  const [a, b, t] = found
  if (timeMs < a.atMs) return null
  return blendCameras(a, b, applyEase(a.ease, clamp01(t)), view)
}

export function firstKeyframeMs(keyframes: readonly { atMs: number }[]): number | null {
  if (keyframes.length === 0) return null
  return Math.min(...keyframes.map((keyframe) => keyframe.atMs))
}
