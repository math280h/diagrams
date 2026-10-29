import { useStore, type ReactFlowState } from '@xyflow/react'
import type { Engine } from '@/engine/engine'
import type { TimelineSegment } from '@/engine/flow/compile'
import { useCaption, useEngine } from '@/engine/hooks'
import { pointAt } from '@/engine/path-sampler'
import type { XY } from '@/model/schema'

function markPoint(segment: TimelineSegment, state: ReactFlowState, engine: Engine): XY | null {
  const { target } = segment
  if (target.kind === 'node') {
    const node = state.nodeLookup.get(target.id)
    return node ? node.internals.positionAbsolute : null
  }
  if (target.kind !== 'edge') return null
  const table = engine.tables.get(target.id)
  if (table && table.lengthPx > 0) return pointAt(table, 0.5)
  const ends = [segment.fromNode, segment.toNode].map((id) => (id ? state.nodeLookup.get(id) : undefined))
  if (!ends[0] || !ends[1]) return null
  const center = (node: NonNullable<(typeof ends)[number]>) => ({
    x: node.internals.positionAbsolute.x + (node.measured.width ?? 0) / 2,
    y: node.internals.positionAbsolute.y + (node.measured.height ?? 0) / 2,
  })
  const [a, b] = [center(ends[0]), center(ends[1])]
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * Numbers the previous, the current and the next step on the canvas, if the flow asks for it.
 *
 * Put this component in the viewport layer of the `ReactFlow` element.
 */
export function StepNumbers() {
  const engine = useEngine()
  const caption = useCaption()
  const timeline = engine.playback.timeline
  const marks = useStore((state) => {
    if (!caption || !timeline?.flow.stepNumbers) return ''
    return [caption.index - 1, caption.index, caption.index + 1]
      .flatMap((index) => {
        const segment = timeline.segments[index]
        const point = segment ? markPoint(segment, state, engine) : null
        return point ? [`${index}:${Math.round(point.x)}:${Math.round(point.y)}`] : []
      })
      .join('|')
  })
  if (!marks || !caption) return null
  return marks.split('|').map((mark) => {
    const [index, x, y] = mark.split(':').map(Number) as [number, number, number]
    return (
      <div
        key={index}
        aria-hidden
        className="dg-step-number dg-mono"
        data-current={index === caption.index || undefined}
        style={{ transform: `translate(${x}px, ${y}px)` }}
      >
        {index + 1}
      </div>
    )
  })
}
