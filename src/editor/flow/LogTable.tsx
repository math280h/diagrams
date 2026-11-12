import { Waypoints } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import type { Timeline, TimelineSegment } from '@/engine/flow/compile'
import { findSegment, stepState } from '@/engine/flow/sides'
import { useEngine, usePlaybackState, useSideIndices } from '@/engine/hooks'
import { KEYS } from '@/lib/shortcut-keys'
import { cn } from '@/lib/utils'
import { findAnyPath, findStep, pathSteps, stepTargets, isOverview, overviewName } from '@/model/flow'
import type { Flow, FlowPath, Step } from '@/model/schema'
import { updateFlow } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { useUi } from '@/store/ui-store'
import { useSegmentIndex } from '@/engine/hooks'
import { markOnCanvas } from './hooks'
import { stepLine } from './names'
import { parseTimeMs, startChanges } from './step-start'
import { StepContextMenu } from './StepContextMenu'
import { selectClickedStep } from './step-selection'

const COLUMNS =
  'grid grid-cols-[24px_12px_minmax(0,1fr)_56px] sm:grid-cols-[28px_72px_14px_minmax(120px,1.3fr)_minmax(64px,0.7fr)_52px] lg:grid-cols-[28px_72px_14px_minmax(140px,1.2fr)_minmax(80px,0.7fr)_56px_minmax(200px,2fr)]'
const COLUMNS_WITHOUT_LATENCY =
  'grid grid-cols-[24px_12px_minmax(0,1fr)] sm:grid-cols-[28px_72px_14px_minmax(120px,1.3fr)_minmax(64px,1fr)] lg:grid-cols-[28px_72px_14px_minmax(140px,1.2fr)_minmax(80px,0.8fr)_minmax(200px,2fr)]'

const HEADER_HEIGHT_PX = 28

function offset(ms: number): string {
  return `+${(ms / 1000).toFixed(3)}s`
}

interface LogRow {
  step: Step
  segment: TimelineSegment | undefined
  number: string
  element: (line: ReturnType<typeof stepLine>) => string
  state: 'skipped' | 'done' | 'active' | 'pending'
  onPath: boolean
  side: boolean
  /** True if a step comes before the step on its track, so its start can change. */
  movable: boolean
}

interface StartEdit {
  /** The typed start, or `null` to keep the old start. */
  startMs: number | null
  keepLater: boolean
  /** True for Enter and Escape: the focus goes back to the row, and the playhead to the step. */
  byKey: boolean
}

function StartInput({
  number,
  startMs,
  onDone,
}: {
  number: string
  startMs: number
  onDone: (edit: StartEdit) => void
}) {
  const [text, setText] = useState(offset(startMs))
  const [invalid, setInvalid] = useState(false)
  const done = useRef(false)
  const finish = (edit: StartEdit) => {
    if (done.current) return
    done.current = true
    onDone(edit)
  }
  return (
    <Input
      autoFocus
      aria-label={`Start of step ${number}, in seconds`}
      aria-invalid={invalid || undefined}
      title={`Enter moves the later steps with the step. ${KEYS.keepLaterSteps} keeps them in place. Esc cancels.`}
      inputMode="decimal"
      spellCheck={false}
      value={text}
      onFocus={(event) => event.currentTarget.select()}
      onContextMenu={(event) => event.stopPropagation()}
      onChange={(event) => {
        setText(event.target.value)
        setInvalid(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          finish({ startMs: null, keepLater: false, byKey: true })
        } else if (event.key === 'Enter') {
          event.preventDefault()
          const parsed = parseTimeMs(text)
          if (parsed === null) setInvalid(true)
          else finish({ startMs: parsed, keepLater: event.altKey, byKey: true })
        }
      }}
      onBlur={() => finish({ startMs: parseTimeMs(text), keepLater: false, byKey: false })}
      className="-ml-[5px] h-5 w-[calc(100%+10px)] rounded-sm px-1 py-0 font-mono text-xs tabular-nums select-text md:text-xs dark:bg-transparent"
    />
  )
}

function logRows(
  steps: readonly Step[],
  path: FlowPath | null,
  timeline: Timeline | null,
  current: number,
  sideIndices: readonly number[],
): LogRow[] {
  const segments = timeline?.segments ?? []
  const pathStepIds = new Set(path?.steps.map((step) => step.id))
  const sides = (timeline?.sides ?? []).flatMap((side, track) => {
    const fromNumber = steps.findIndex((step) => step.id === side.from.step.id) + 1
    let startMs = side.from.endMs
    return side.path.steps.map((step, index) => {
      const segment = side.segments.find((candidate) => candidate.step.id === step.id)
      if (segment) startMs = segment.startMs
      const row: LogRow = {
        step,
        segment,
        number: `${fromNumber}.${index + 1}`,
        element: (line) => (isOverview(step) ? overviewName(index, side.path.steps.length) : line.element),
        state: segment ? stepState(segment.index, sideIndices[track] ?? -1) : 'skipped',
        onPath: true,
        side: true,
        movable: segment !== undefined,
      }
      return { row, startMs }
    })
  })
  const pending = sides.toSorted((a, b) => a.startMs - b.startMs)
  const rows: LogRow[] = []
  steps.forEach((step, index) => {
    const segment = segments.find((candidate) => candidate.step.id === step.id)
    const startMs = segment?.startMs ?? -Infinity
    while (pending.length > 0 && pending[0]!.startMs <= startMs) rows.push(pending.shift()!.row)
    rows.push({
      step,
      segment,
      number: String(index + 1),
      element: (line) => (isOverview(step) ? overviewName(index, steps.length) : line.element),
      state: segment ? stepState(segment.index, current) : 'skipped',
      onPath: pathStepIds.has(step.id),
      side: false,
      movable: (segment?.index ?? 0) > 0,
    })
  })
  return [...rows, ...pending.map(({ row }) => row)]
}

export function LogTable({ flow }: { flow: Flow }) {
  const engine = useEngine()
  const playback = usePlaybackState()
  const recording = useUi((state) => state.recording)
  const selectedStepIds = useUi((state) => state.selectedStepIds)
  const path = findAnyPath(
    flow,
    useUi((state) => state.activePathId),
  )
  const alternative = path && !path.concurrent ? path : null
  const steps = pathSteps(flow, alternative?.id ?? null)
  const current = useSegmentIndex()
  const sideIndices = useSideIndices()
  useDoc((state) => state.nodes)
  useDoc((state) => state.edges)
  const rows = logRows(steps, alternative, playback.timeline, current, sideIndices)
  const order = rows.map((row) => row.step.id)
  const listRef = useRef<HTMLDivElement>(null)
  const showLatency = rows.some((row) => row.step.latencyMs !== null)
  const columns = showLatency ? COLUMNS : COLUMNS_WITHOUT_LATENCY
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const refocusStepId = useRef<string | null>(null)
  const seekAfterEdit = useRef<{ stepId: string; from: Timeline } | null>(null)

  useEffect(() => {
    const list = listRef.current
    const row = list?.querySelector<HTMLElement>(`[data-index="${current}"]`)
    if (!list || !row) return
    list.scrollTo({ top: Math.max(0, row.offsetTop - HEADER_HEIGHT_PX - row.offsetHeight), behavior: 'smooth' })
  }, [current])

  useEffect(() => {
    const pending = seekAfterEdit.current
    const timeline = playback.timeline
    if (!pending || !timeline || timeline === pending.from) return
    seekAfterEdit.current = null
    const found = findSegment(timeline, pending.stepId)
    if (found) engine.playback.seek(found.segment.startMs + 1)
  }, [engine, playback.timeline])

  useEffect(() => () => markOnCanvas([]), [])

  const startEditing = (stepId: string) => {
    engine.playback.pause()
    setEditingStepId(stepId)
  }

  const finishEditing = (stepId: string, { startMs, keepLater, byKey }: StartEdit) => {
    setEditingStepId(null)
    if (byKey) refocusStepId.current = stepId
    const timeline = engine.playback.timeline
    if (startMs === null || !timeline) return
    const changes = startChanges(timeline, stepId, startMs, keepLater)
    if (changes.length === 0) return
    if (byKey) seekAfterEdit.current = { stepId, from: timeline }
    updateFlow(flow.id, (draft) => {
      for (const change of changes) {
        const place = findStep(draft, change.stepId)
        if (place) place.step.durationMs = change.durationMs
      }
    })
  }

  if (path && path.steps.length === 0) {
    const kind = path.concurrent ? 'side path' : 'path'
    return (
      <div className="m-2 flex flex-1 items-center gap-3 rounded-md border border-dashed px-4 text-sm text-muted-foreground">
        <Waypoints className="size-4 shrink-0" />
        {recording
          ? `Click the node that the ${kind} reaches first.`
          : `Press Record, then click the nodes that “${path.name}” reaches ${path.concurrent ? 'at the same time as' : 'instead of'} the main steps.`}
      </div>
    )
  }

  if (flow.steps.length === 0) {
    return (
      <div className="m-2 flex flex-1 items-center gap-3 rounded-md border border-dashed px-4 text-sm text-muted-foreground">
        <Waypoints className="size-4 shrink-0" />
        {recording
          ? 'Click a node to add the first step.'
          : 'Press Record, then click the nodes in the order the flow reaches them. The token travels the connections between them.'}
      </div>
    )
  }

  return (
    <StepContextMenu ref={listRef} data-step-list className="relative min-h-0 flex-1 overflow-y-auto select-none">
      <div
        aria-hidden
        className={cn(
          columns,
          'sticky top-0 z-[1] h-7 items-center gap-x-3 border-b bg-panel px-3 text-xs text-muted-foreground',
        )}
      >
        <span className="text-right">#</span>
        <span className="max-sm:hidden">Offset</span>
        <span />
        <span>Element</span>
        <span className="max-sm:hidden">Event</span>
        {showLatency && <span className="text-right">Latency</span>}
        <span className="max-lg:hidden">Caption</span>
      </div>
      {rows.map(({ step, segment, number, element: elementOf, state, onPath, side, movable }) => {
        const line = stepLine(step, segment?.lanes)
        const element = elementOf(line)
        const { event } = line
        const body = flow.bodies ? line.body : ''
        const selected = selectedStepIds.includes(step.id)
        const row = {
          'data-index': side ? undefined : segment?.index,
          'data-side': side || undefined,
          'data-state': state,
          'data-kind': step.target.kind,
          'data-level': step.level,
          'data-path': onPath || undefined,
          'data-selected': selected || undefined,
          'data-step-id': step.id,
          onPointerEnter: () => markOnCanvas(stepTargets(step)),
          onPointerLeave: () => markOnCanvas([]),
          className: cn(
            columns,
            'dg-log-row h-6 w-full items-center gap-x-3 px-3 text-left font-mono text-xs tabular-nums',
          ),
        }
        const cells = (start: ReactNode) => (
          <>
            <span className="text-right text-muted-foreground">{number}</span>
            {start}
            <span className="dg-log-dot" />
            <span className="truncate font-sans text-[13px]">{element}</span>
            <span className="dg-log-event truncate max-sm:hidden" title={body ? `${event} ${body}`.trim() : undefined}>
              {event}
              {body && <span className={cn('dg-log-dim', event && 'ml-1.5')}>{body}</span>}
            </span>
            {showLatency && (
              <span className="dg-log-dim text-right whitespace-nowrap">
                {step.latencyMs === null ? '' : `${step.latencyMs} ms`}
              </span>
            )}
            <span className="dg-log-caption truncate font-sans text-[13px] max-lg:hidden">{step.caption}</span>
            <span className="sr-only">
              {selected && ', selected'}, {state}
            </span>
          </>
        )
        if (editingStepId === step.id && segment) {
          return (
            <div key={step.id} {...row}>
              {cells(
                <StartInput
                  number={number}
                  startMs={segment.startMs}
                  onDone={(edit) => finishEditing(step.id, edit)}
                />,
              )}
            </div>
          )
        }
        return (
          <button
            key={step.id}
            ref={(button) => {
              if (!button || refocusStepId.current !== step.id) return
              refocusStepId.current = null
              button.focus()
            }}
            type="button"
            {...row}
            aria-current={state === 'active' ? 'step' : undefined}
            aria-keyshortcuts={movable ? KEYS.changeStart : undefined}
            onClick={(click) => {
              if (selectClickedStep(click, step.id, order) && segment) engine.playback.seek(segment.startMs + 1)
            }}
            onKeyDown={(key) => {
              if (key.key !== 'F2' || !movable) return
              key.preventDefault()
              if (key.currentTarget.querySelector('[data-start]')?.checkVisibility()) startEditing(step.id)
            }}
            onFocus={() => markOnCanvas(stepTargets(step))}
            onBlur={() => markOnCanvas([])}
          >
            {cells(
              <span
                data-start
                className="dg-log-dim max-sm:hidden"
                title={
                  movable ? 'Double-click to change when the step starts. The later steps move with it.' : undefined
                }
                onDoubleClick={movable ? () => startEditing(step.id) : undefined}
              >
                {segment ? offset(segment.startMs) : '—'}
              </span>,
            )}
          </button>
        )
      })}
    </StepContextMenu>
  )
}
