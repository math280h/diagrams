import { Waypoints } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useEngine, usePlaybackState } from '@/engine/hooks'
import { cn } from '@/lib/utils'
import { findPath, pathSteps, stepTargets } from '@/model/flow'
import type { Flow } from '@/model/schema'
import { selectOnly } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { setUi, useUi } from '@/store/ui-store'
import { useSegmentIndex } from '@/engine/hooks'
import { markOnCanvas } from './hooks'
import { stepLine } from './names'

const COLUMNS =
  'grid grid-cols-[24px_12px_minmax(0,1fr)_56px] sm:grid-cols-[28px_72px_14px_minmax(120px,1.3fr)_minmax(64px,0.7fr)_52px] lg:grid-cols-[28px_72px_14px_minmax(140px,1.2fr)_minmax(80px,0.7fr)_56px_minmax(200px,2fr)]'
const COLUMNS_WITHOUT_LATENCY =
  'grid grid-cols-[24px_12px_minmax(0,1fr)] sm:grid-cols-[28px_72px_14px_minmax(120px,1.3fr)_minmax(64px,1fr)] lg:grid-cols-[28px_72px_14px_minmax(140px,1.2fr)_minmax(80px,0.8fr)_minmax(200px,2fr)]'

const HEADER_HEIGHT_PX = 28

function offset(ms: number): string {
  return `+${(ms / 1000).toFixed(3)}s`
}

export function LogTable({ flow }: { flow: Flow }) {
  const engine = useEngine()
  const playback = usePlaybackState()
  const recording = useUi((state) => state.recording)
  const selectedStepId = useUi((state) => state.selectedStepId)
  const path = findPath(
    flow,
    useUi((state) => state.activePathId),
  )
  const steps = pathSteps(flow, path?.id ?? null)
  const pathStepIds = new Set(path?.steps.map((step) => step.id))
  const current = useSegmentIndex()
  useDoc((state) => state.nodes)
  useDoc((state) => state.edges)
  const segments = playback.timeline?.segments ?? []
  const listRef = useRef<HTMLDivElement>(null)
  const showLatency = steps.some((step) => step.latencyMs !== null)
  const columns = showLatency ? COLUMNS : COLUMNS_WITHOUT_LATENCY

  useEffect(() => {
    const list = listRef.current
    const row = list?.querySelector<HTMLElement>(`[data-index="${current}"]`)
    if (!list || !row) return
    list.scrollTo({ top: Math.max(0, row.offsetTop - HEADER_HEIGHT_PX - row.offsetHeight), behavior: 'smooth' })
  }, [current])

  useEffect(() => () => markOnCanvas([]), [])

  if (path && path.steps.length === 0) {
    return (
      <div className="m-2 flex flex-1 items-center gap-3 rounded-md border border-dashed px-4 text-sm text-muted-foreground">
        <Waypoints className="size-4 shrink-0" />
        {recording
          ? 'Click the node that the path reaches first.'
          : `Press Record, then click the nodes that “${path.name}” reaches instead of the main steps.`}
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
    <div ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto">
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
      {steps.map((step, index) => {
        const segment = segments.find((candidate) => candidate.step.id === step.id)
        const state = !segment
          ? 'skipped'
          : segment.index < current
            ? 'done'
            : segment.index === current
              ? 'active'
              : 'pending'
        const line = stepLine(step, segment?.lanes)
        const { element, event } = line
        const body = flow.bodies ? line.body : ''
        const selected = selectedStepId === step.id
        return (
          <button
            key={step.id}
            type="button"
            aria-label={`Step ${index + 1}: ${element}${event ? `, ${event}` : ''}, ${state}`}
            data-index={segment?.index}
            data-state={state}
            data-kind={step.target.kind}
            data-level={step.level}
            data-path={pathStepIds.has(step.id) || undefined}
            aria-current={state === 'active' ? 'step' : undefined}
            onClick={() => {
              selectOnly([])
              setUi({ selectedStepId: step.id })
              if (segment) engine.playback.seek(segment.startMs + 1)
            }}
            onPointerEnter={() => markOnCanvas(stepTargets(step))}
            onPointerLeave={() => markOnCanvas([])}
            onFocus={() => markOnCanvas(stepTargets(step))}
            onBlur={() => markOnCanvas([])}
            className={cn(
              columns,
              'dg-log-row h-6 w-full items-center gap-x-3 px-3 text-left font-mono text-xs tabular-nums',
              selected && 'dg-log-row-selected',
            )}
          >
            <span className="text-right text-muted-foreground">{index + 1}</span>
            <span className="dg-log-dim max-sm:hidden">{segment ? offset(segment.startMs) : '—'}</span>
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
          </button>
        )
      })}
    </div>
  )
}
