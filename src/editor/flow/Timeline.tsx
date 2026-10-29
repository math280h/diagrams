import { useReactFlow } from '@xyflow/react'
import { Camera, Diamond, Eye, Minus, Plus, Trash2, Waves } from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useEngine, usePlaybackState } from '@/engine/hooks'
import { viewportToCamera } from '@/engine/camera'
import { cn } from '@/lib/utils'
import { newId } from '@/model/defaults'
import type { CameraKeyframe, Ease, Flow, Track, ValueKeyframe } from '@/model/schema'
import { selectOnly, updateFlow } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { setUi, useUi } from '@/store/ui-store'
import { Segmented, SliderField } from '@/editor/inspector/controls'
import { stepLine, targetName } from './names'
import { findStep, overviewName } from '@/model/flow'

const MIN_STEP_MS = 200
const STEP_SNAP_MS = 50
const LABEL_WIDTH = 148
const LANE_HEIGHT = 30
const MIN_PX_PER_SECOND = 20
const MAX_PX_PER_SECOND = 400

function trackLabel(track: Track): { icon: ReactNode; text: string } {
  if (track.kind === 'camera') return { icon: <Camera className="size-3.5" />, text: 'Camera' }
  const name = targetName(track.target)
  return track.kind === 'emphasis'
    ? { icon: <Eye className="size-3.5" />, text: name }
    : { icon: <Waves className="size-3.5" />, text: name }
}

function dragHandler(onMove: (deltaPx: number, event: PointerEvent) => void, onEnd?: (moved: boolean) => void) {
  return (event: ReactPointerEvent) => {
    event.stopPropagation()
    const startX = event.clientX
    let moved = false
    const move = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX
      if (Math.abs(delta) > 2) moved = true
      if (moved) onMove(delta, moveEvent)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onEnd?.(moved)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
}

function KeyframeEditor({ flow, track, keyframeId }: { flow: Flow; track: Track; keyframeId: string }) {
  const keyframe = track.keyframes.find((candidate) => candidate.id === keyframeId)
  const { getViewport } = useReactFlow()
  const engine = useEngine()
  if (!keyframe) return null
  const edit = (recipe: (draft: CameraKeyframe | ValueKeyframe) => void, key?: string) =>
    updateFlow(
      flow.id,
      (draft) => {
        const found = draft.tracks
          .find((candidate) => candidate.id === track.id)
          ?.keyframes.find((candidate) => candidate.id === keyframeId)
        if (found) recipe(found)
      },
      key,
    )
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium">Keyframe at {(keyframe.atMs / 1000).toFixed(2)} s</p>
      {'value' in keyframe ? (
        <SliderField
          label={track.kind === 'emphasis' ? 'Opacity' : 'Traffic'}
          value={Math.round(keyframe.value * 100)}
          min={0}
          max={100}
          step={1}
          format={(value) => `${value}%`}
          onChange={(value) =>
            edit((draft) => void ('value' in draft && (draft.value = value / 100)), `kf-value:${keyframeId}`)
          }
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            const camera = viewportToCamera(getViewport(), engine.view)
            edit((draft) => {
              if ('zoom' in draft) Object.assign(draft, { x: camera.x, y: camera.y, zoom: camera.zoom })
            })
          }}
        >
          <Camera /> Use the current view
        </Button>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-foreground/80">Ease to next</span>
        <Segmented<Ease>
          value={keyframe.ease}
          onChange={(ease) => edit((draft) => void (draft.ease = ease))}
          options={[
            { value: 'inOut', label: 'Smooth' },
            { value: 'linear', label: 'Linear' },
            { value: 'hold', label: 'Hold' },
          ]}
        />
      </div>
      <Button
        variant="destructive"
        size="sm"
        className="w-full"
        onClick={() =>
          updateFlow(flow.id, (draft) => {
            const target = draft.tracks.find((candidate) => candidate.id === track.id)
            if (target)
              target.keyframes = target.keyframes.filter(
                (candidate) => candidate.id !== keyframeId,
              ) as typeof target.keyframes
          })
        }
      >
        <Trash2 /> Delete keyframe
      </Button>
    </div>
  )
}

export function Timeline({ flow }: { flow: Flow }) {
  const engine = useEngine()
  const playback = usePlaybackState()
  const { getViewport } = useReactFlow()
  const selectedStepId = useUi((state) => state.selectedStepId)
  const selection = useDoc(
    useShallow((state) => ({
      node: state.nodes.find((node) => node.selected)?.id,
      edge: state.edges.find((edge) => edge.selected)?.id,
    })),
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const [pxPerSecond, setPxPerSecond] = useState<number | null>(null)
  const [openKeyframe, setOpenKeyframe] = useState<string | null>(null)
  const durationMs = Math.max(playback.durationMs, 1000)
  const segments = playback.timeline?.segments ?? []

  useLayoutEffect(() => {
    if (pxPerSecond !== null || !scrollRef.current) return
    const available = scrollRef.current.clientWidth - 24
    setPxPerSecond(Math.max(MIN_PX_PER_SECOND, Math.min(MAX_PX_PER_SECOND, available / (durationMs / 1000))))
  }, [pxPerSecond, durationMs])

  const scale = (pxPerSecond ?? 80) / 1000
  const contentWidth = durationMs * scale + 48

  useEffect(() => {
    const write = (time: number) => {
      if (headRef.current) headRef.current.style.transform = `translateX(${time * scale}px)`
    }
    write(engine.playback.time.get())
    return engine.playback.time.on('change', write)
  }, [engine, scale])

  const seekAt = (event: ReactPointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect()
    engine.playback.pause()
    engine.playback.seek((event.clientX - rect.left) / scale)
  }

  const addKeyframe = (track: Track, atMs = engine.playback.time.get()) => {
    const id = newId('k')
    updateFlow(flow.id, (draft) => {
      const target = draft.tracks.find((candidate) => candidate.id === track.id)
      if (!target) return
      if (target.kind === 'camera') {
        const camera = viewportToCamera(getViewport(), engine.view)
        target.keyframes.push({ id, atMs, ease: 'inOut', ...camera })
      } else {
        target.keyframes.push({ id, atMs, ease: 'inOut', value: 1 })
      }
    })
    setOpenKeyframe(id)
  }

  const addTrack = (track: Track) => updateFlow(flow.id, (draft) => void draft.tracks.push(track))
  const hasCamera = flow.tracks.some((track) => track.kind === 'camera')
  const ticks = Array.from({ length: Math.floor(durationMs / 1000) + 1 }, (_, second) => second)

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-panel-border text-xs">
      <div className="flex shrink-0 flex-col border-r border-panel-border" style={{ width: LABEL_WIDTH }}>
        <div className="flex h-6 items-center gap-0.5 border-b border-panel-border px-1">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Zoom the timeline out"
            onClick={() => setPxPerSecond((value) => Math.max(MIN_PX_PER_SECOND, (value ?? 80) / 1.4))}
          >
            <Minus />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Zoom the timeline in"
            onClick={() => setPxPerSecond((value) => Math.min(MAX_PX_PER_SECOND, (value ?? 80) * 1.4))}
          >
            <Plus />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="xs" className="ml-auto" />}>
              <Plus /> Track
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" className="w-60">
              <DropdownMenuItem
                disabled={hasCamera}
                onClick={() => addTrack({ id: newId('t'), kind: 'camera', keyframes: [] })}
              >
                <Camera /> Camera path
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!selection.node && !selection.edge}
                onClick={() => {
                  const target = selection.node
                    ? { kind: 'node' as const, id: selection.node }
                    : { kind: 'edge' as const, id: selection.edge! }
                  addTrack({ id: newId('t'), kind: 'emphasis', target, keyframes: [] })
                }}
              >
                <Eye /> Opacity of the selection
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!selection.edge}
                onClick={() =>
                  addTrack({
                    id: newId('t'),
                    kind: 'traffic',
                    target: { kind: 'edge', id: selection.edge! },
                    keyframes: [],
                  })
                }
              >
                <Waves /> Traffic of the selected connection
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center px-2 text-muted-foreground" style={{ height: LANE_HEIGHT }}>
          Steps
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {flow.tracks.map((track) => {
            const label = trackLabel(track)
            return (
              <div
                key={track.id}
                className="group flex items-center gap-1.5 px-2 text-muted-foreground"
                style={{ height: LANE_HEIGHT }}
              >
                {label.icon}
                <span className="min-w-0 flex-1 truncate text-foreground/85">{label.text}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Add a keyframe at the playhead"
                  aria-label="Add a keyframe at the playhead"
                  className="opacity-60 hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => addKeyframe(track)}
                >
                  <Diamond />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Delete track"
                  aria-label="Delete track"
                  className="opacity-0 group-hover:opacity-60 hover:!opacity-100 focus-visible:opacity-100"
                  onClick={() =>
                    updateFlow(
                      flow.id,
                      (draft) => void (draft.tracks = draft.tracks.filter((candidate) => candidate.id !== track.id)),
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            )
          })}
        </div>
      </div>

      <div ref={scrollRef} className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div className="relative h-full" style={{ width: contentWidth }}>
          <div className="relative h-6 cursor-pointer border-b border-panel-border" onPointerDown={seekAt}>
            {ticks.map((second) => (
              <div
                key={second}
                className="absolute top-0 h-full border-l border-panel-border pl-1 font-mono text-[11px] leading-6 text-muted-foreground"
                style={{ left: second * 1000 * scale }}
              >
                {second}s
              </div>
            ))}
          </div>
          <div className="relative border-b border-panel-border" style={{ height: LANE_HEIGHT }}>
            {segments.map((segment) => {
              const { step } = segment
              const width = Math.max(6, (segment.endMs - segment.startMs) * scale)
              const line = stepLine(step, segment.lanes)
              const label =
                step.target.kind === 'flow'
                  ? overviewName(segment.index, segments.length)
                  : step.target.kind === 'node'
                    ? targetName(step.target)
                    : `→ ${line.event || line.element}`
              const next = segments[segment.index + 1]?.step
              const resize = (requestedMs: number, local: boolean) =>
                updateFlow(
                  flow.id,
                  (draft) => {
                    const place = findStep(draft, step.id)
                    if (!place) return
                    const after = local ? place.list.find((candidate) => candidate.id === next?.id) : undefined
                    let target = Math.max(MIN_STEP_MS, Math.round(requestedMs / STEP_SNAP_MS) * STEP_SNAP_MS)
                    if (after && next) {
                      const total = step.durationMs + next.durationMs
                      target = Math.min(target, total - MIN_STEP_MS)
                      after.durationMs = total - target
                    }
                    place.step.durationMs = target
                  },
                  `duration:${step.id}`,
                )
              return (
                <div
                  key={step.id}
                  title={[step.target.kind === 'flow' ? label : line.element, line.event].filter(Boolean).join(': ')}
                  className={cn(
                    'absolute top-1 bottom-1 flex items-center overflow-hidden rounded-md border px-1.5 text-[11px]',
                    step.target.kind === 'flow'
                      ? 'bg-flow/15'
                      : step.target.kind === 'node'
                        ? 'bg-accent'
                        : 'bg-muted/50',
                    selectedStepId === step.id ? 'border-foreground/50' : 'border-transparent',
                  )}
                  style={{ left: segment.startMs * scale, width: width - 2 }}
                  onClick={() => {
                    selectOnly([])
                    setUi({ selectedStepId: step.id })
                    engine.playback.seek(segment.startMs + 1)
                  }}
                >
                  <span className="truncate">{label}</span>
                  <div
                    role="separator"
                    tabIndex={0}
                    aria-orientation="vertical"
                    aria-label={`End of step ${segment.index + 1}. Arrow keys change its time; with Alt, the next step keeps its start.`}
                    aria-valuenow={step.durationMs}
                    aria-valuemin={MIN_STEP_MS}
                    title="Drag to change the time of the step. The later steps move with it; hold Alt to keep them in place."
                    className="absolute top-0 right-0 bottom-0 w-1.5 cursor-ew-resize outline-none hover:bg-foreground/30 focus-visible:bg-ring"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                      event.preventDefault()
                      const delta = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 500 : STEP_SNAP_MS * 2)
                      resize(step.durationMs + delta, event.altKey)
                    }}
                    onPointerDown={dragHandler((delta, moveEvent) =>
                      resize(step.durationMs + delta / scale, moveEvent.altKey),
                    )}
                  />
                </div>
              )
            })}
          </div>
          {flow.tracks.map((track) => (
            <div
              key={track.id}
              className="relative border-b border-panel-border/60"
              style={{ height: LANE_HEIGHT }}
              onDoubleClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                addKeyframe(track, Math.max(0, (event.clientX - rect.left) / scale))
              }}
            >
              {track.keyframes.length > 1 && (
                <div
                  className="absolute top-1/2 h-px bg-foreground/20"
                  style={{
                    left: Math.min(...track.keyframes.map((keyframe) => keyframe.atMs)) * scale,
                    width:
                      (Math.max(...track.keyframes.map((keyframe) => keyframe.atMs)) -
                        Math.min(...track.keyframes.map((keyframe) => keyframe.atMs))) *
                      scale,
                  }}
                />
              )}
              {track.keyframes.map((keyframe) => (
                <Popover
                  key={keyframe.id}
                  open={openKeyframe === keyframe.id}
                  onOpenChange={(open) => setOpenKeyframe(open ? keyframe.id : null)}
                >
                  <PopoverTrigger
                    nativeButton={false}
                    render={
                      <div
                        role="button"
                        aria-label="Keyframe"
                        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-grab rounded-[2px] border border-foreground/70 bg-background hover:bg-foreground"
                        style={{ left: keyframe.atMs * scale }}
                        onPointerDown={dragHandler((delta) =>
                          updateFlow(
                            flow.id,
                            (draft) => {
                              const found = draft.tracks
                                .find((candidate) => candidate.id === track.id)
                                ?.keyframes.find((candidate) => candidate.id === keyframe.id)
                              if (found) found.atMs = Math.max(0, Math.round((keyframe.atMs + delta / scale) / 50) * 50)
                            },
                            `kf-time:${keyframe.id}`,
                          ),
                        )}
                      />
                    }
                  />
                  <PopoverContent side="top" className="w-64">
                    <KeyframeEditor flow={flow} track={track} keyframeId={keyframe.id} />
                  </PopoverContent>
                </Popover>
              ))}
            </div>
          ))}
          {flow.tracks.length === 0 && (
            <p className="px-3 py-2 text-muted-foreground">
              Add a track for a camera path, or to fade a node, a connection or its traffic in and out. Double-click a
              track row to add a keyframe.
            </p>
          )}
          <div ref={headRef} className="pointer-events-none absolute top-0 bottom-0 left-0 w-px bg-foreground" />
        </div>
      </div>
    </div>
  )
}
