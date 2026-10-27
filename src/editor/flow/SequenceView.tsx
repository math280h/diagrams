import { Waypoints } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useEngine } from '@/engine/hooks'
import { flowSequence, type SequenceRow } from '@/export/sequence'
import { cn } from '@/lib/utils'
import type { Flow } from '@/model/schema'
import { selectOnly } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { setUi, useUi } from '@/store/ui-store'
import { markOnCanvas, useSegmentIndex } from './hooks'

const COLUMN_PX = 168
const ROW_PX = 32
const HEADER_PX = 34
const ARROW_Y_PX = 24
const ARROW_HEAD_PX = 6
/** The smallest width of a step label. A row holds one step, so a label can reach over the next lifelines. */
const LABEL_MIN_PX = 2 * COLUMN_PX - 16
const NOTE_PX = COLUMN_PX + COLUMN_PX / 2 - 16

function center(column: number): number {
  return column * COLUMN_PX + COLUMN_PX / 2
}

/** Returns the left edge of a box of the width, centred on `middle` and kept inside the row. */
function boxLeft(middle: number, boxWidth: number, rowWidth: number): number {
  return Math.min(Math.max(0, middle - boxWidth / 2), Math.max(0, rowWidth - boxWidth))
}

function rowLabel(row: SequenceRow): string {
  return [row.text, row.latencyMs === null ? '' : `${row.latencyMs} ms`].filter(Boolean).join(' · ')
}

function rowTitle(row: SequenceRow): string {
  return [rowLabel(row), row.kind === 'message' ? row.body : '', row.caption].filter(Boolean).join('\n')
}

function Message({ row, rowWidth }: { row: Extract<SequenceRow, { kind: 'message' }>; rowWidth: number }) {
  const from = center(row.from)
  const to = center(row.to)
  const labelWidth = Math.min(rowWidth, Math.max(Math.abs(to - from), LABEL_MIN_PX))
  const direction = to >= from ? 1 : -1
  const tip = to - direction
  return (
    <>
      <span
        className="dg-log-event absolute top-1 truncate px-2 text-center font-mono text-xs"
        style={{ left: boxLeft((from + to) / 2, labelWidth, rowWidth), width: labelWidth }}
      >
        {rowLabel(row)}
      </span>
      <svg className="pointer-events-none absolute inset-0 h-full overflow-visible" width="100%" aria-hidden>
        <line
          x1={from}
          x2={tip - direction * ARROW_HEAD_PX}
          y1={ARROW_Y_PX}
          y2={ARROW_Y_PX}
          className="dg-seq-line"
          strokeDasharray={row.reply ? '4 3' : undefined}
        />
        {row.level === 'error' ? (
          <path d={`M${tip - 4} ${ARROW_Y_PX - 4} l8 8 M${tip - 4} ${ARROW_Y_PX + 4} l8 -8`} className="dg-seq-line" />
        ) : (
          <path
            d={`M${tip} ${ARROW_Y_PX} l${-direction * ARROW_HEAD_PX} ${-ARROW_HEAD_PX / 1.5} v${(ARROW_HEAD_PX * 4) / 3} z`}
            className="dg-seq-head"
          />
        )}
      </svg>
    </>
  )
}

function Note({ row, rowWidth }: { row: Extract<SequenceRow, { kind: 'note' }>; rowWidth: number }) {
  const width = Math.min(NOTE_PX, rowWidth)
  return (
    <span
      className="dg-seq-note absolute top-1 bottom-1 truncate rounded-sm border px-2 text-center font-mono text-xs leading-[20px]"
      style={{ left: boxLeft(center(row.over), width, rowWidth), width }}
    >
      <span className="dg-log-event">{rowLabel(row) || '·'}</span>
    </span>
  )
}

/** Shows a flow as a sequence diagram: a lifeline for each node it reaches and a row for each step. */
export function SequenceView({ flow }: { flow: Flow }) {
  const engine = useEngine()
  const nodes = useDoc((state) => state.nodes)
  const edges = useDoc((state) => state.edges)
  const selectedStepId = useUi((state) => state.selectedStepId)
  const current = useSegmentIndex()
  const sequence = useMemo(() => flowSequence(flow, { nodes, edges }), [flow, nodes, edges])
  const scrollRef = useRef<HTMLDivElement>(null)
  const width = sequence.participants.length * COLUMN_PX

  useEffect(() => {
    const scroller = scrollRef.current
    const row = scroller?.querySelector<HTMLElement>(`[data-index="${current}"]`)
    if (!scroller || !row) return
    scroller.scrollTo({ top: Math.max(0, row.offsetTop - HEADER_PX - ROW_PX), behavior: 'smooth' })
  }, [current])

  useEffect(() => () => markOnCanvas(null), [])

  if (sequence.rows.length === 0) {
    return (
      <div className="m-2 flex flex-1 items-center gap-3 rounded-md border border-dashed px-4 text-sm text-muted-foreground">
        <Waypoints className="size-4 shrink-0" />
        Add steps to the flow to see it as a sequence of calls between its nodes.
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto" aria-label="Sequence" role="region">
      <div className="relative" style={{ width, minWidth: '100%' }}>
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0" style={{ width }}>
          {sequence.participants.map((participant, index) => (
            <span
              key={participant.nodeId}
              className="dg-seq-lifeline absolute inset-y-0 w-px"
              style={{ left: center(index) }}
            />
          ))}
        </div>
        <div className="sticky top-0 z-[1] flex border-b bg-panel" style={{ width, height: HEADER_PX }}>
          {sequence.participants.map((participant) => (
            <button
              key={participant.nodeId}
              type="button"
              className="mx-2 my-1 truncate rounded-md border bg-raised px-2 text-xs font-medium hover:bg-accent"
              style={{ width: COLUMN_PX - 16 }}
              title={participant.title}
              onClick={() => selectOnly([participant.nodeId])}
              onPointerEnter={() => markOnCanvas({ kind: 'node', id: participant.nodeId })}
              onPointerLeave={() => markOnCanvas(null)}
            >
              {participant.title}
            </button>
          ))}
        </div>
        {sequence.rows.map((row) => {
          const state = row.segmentIndex < current ? 'done' : row.segmentIndex === current ? 'active' : 'pending'
          return (
            <button
              key={row.step.id}
              type="button"
              data-index={row.segmentIndex}
              data-state={state}
              data-level={row.level}
              aria-current={state === 'active' ? 'step' : undefined}
              aria-label={`Step ${row.segmentIndex + 1}: ${
                row.kind === 'message'
                  ? `${sequence.participants[row.from]!.title} to ${sequence.participants[row.to]!.title}`
                  : sequence.participants[row.over]!.title
              }${row.text ? `, ${row.text}` : ''}, ${state}`}
              title={rowTitle(row)}
              onClick={() => {
                selectOnly([])
                setUi({ selectedStepId: row.step.id })
                engine.playback.seek((engine.playback.timeline?.segments[row.segmentIndex]?.startMs ?? 0) + 1)
              }}
              onPointerEnter={() => markOnCanvas(row.step.target)}
              onPointerLeave={() => markOnCanvas(null)}
              onFocus={() => markOnCanvas(row.step.target)}
              onBlur={() => markOnCanvas(null)}
              className={cn(
                'dg-log-row dg-seq-row relative block w-full',
                selectedStepId === row.step.id && 'dg-log-row-selected',
              )}
              style={{ height: ROW_PX, width }}
            >
              {row.kind === 'message' ? <Message row={row} rowWidth={width} /> : <Note row={row} rowWidth={width} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
