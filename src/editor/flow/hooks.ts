import { useEffect, useState } from 'react'
import { segmentIndexAt } from '@/engine/flow/compile'
import type { Engine } from '@/engine/engine'
import { useEngine } from '@/engine/hooks'

/** Returns the index of the timeline segment at the playback time, or -1 without a timeline. */
export function useSegmentIndex(): number {
  const engine = useEngine()
  const [index, setIndex] = useState(-1)
  useEffect(() => {
    const update = (time: number) => {
      const timeline = engine.playback.timeline
      setIndex(timeline ? segmentIndexAt(timeline, time) : -1)
    }
    update(engine.playback.time.get())
    return engine.playback.time.on('change', update)
  }, [engine, engine.playback.timeline])
  return index
}

/** Marks nodes and edges on the editor canvas. An empty list removes the marks. */
export function markOnCanvas(targets: readonly { kind: 'node' | 'edge'; id: string }[]) {
  const root = document.querySelector('[data-editor-canvas]')
  if (!root) return
  for (const element of root.querySelectorAll('[data-hover]')) element.removeAttribute('data-hover')
  for (const target of targets) {
    const selector = target.kind === 'node' ? '.react-flow__node' : '.react-flow__edge'
    root.querySelector(`${selector}[data-id="${CSS.escape(target.id)}"]`)?.setAttribute('data-hover', 'true')
  }
}

/** Pauses the flow and moves the playhead to the start of the next or the previous node step. */
export function stepFlow(engine: Engine, direction: 1 | -1) {
  const timeline = engine.playback.timeline
  if (!timeline || timeline.segments.length === 0) return
  const current = segmentIndexAt(timeline, engine.playback.time.get())
  const nodeSegments = timeline.segments.filter((segment) => segment.step.target.kind === 'node')
  const target =
    direction > 0
      ? nodeSegments.find((segment) => segment.index > current)
      : [...nodeSegments].reverse().find((segment) => segment.index < current)
  engine.playback.pause()
  engine.playback.seek(target ? target.startMs + 1 : direction > 0 ? engine.playback.durationMs : 0)
}
