import { applyEdgeChanges, type EdgeChange } from '@xyflow/react'
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Pause,
  Play,
  SkipBack,
  Waypoints,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useCanvasTheme } from '@/canvas/canvas-theme'
import { useLocalNodes } from '@/canvas/use-local-nodes'
import { DiagramCanvas } from '@/canvas/DiagramCanvas'
import { CAPTION_HEIGHT_PX } from '@/canvas/FlowOverlay'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Kbd } from '@/components/ui/kbd'
import { useEngine, usePlaybackState } from '@/engine/hooks'
import { compileFlow, segmentIndexAt } from '@/engine/flow/compile'
import { shortcutLetter } from '@/lib/keys'
import { prefersReducedMotion } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { Diagram, Flow } from '@/model/schema'
import type { DiagramEdge } from '@/model/types'
import { fromDiagram } from '@/persistence/serialize'
import { Scrubber } from './Scrubber'

const IDLE_HIDE_MS = 2600

async function toggleFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen()
  else await document.documentElement.requestFullscreen()
}

function FlowPicker({
  flows,
  flow,
  onChange,
}: {
  flows: readonly Flow[]
  flow: Flow
  onChange: (flowId: string) => void
}) {
  if (flows.length < 2) {
    return <span className="max-w-48 truncate px-1.5 text-sm font-medium max-md:hidden">{flow.name}</span>
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="max-w-48 max-sm:max-w-32" />}>
        <Waypoints />
        <span className="truncate">{flow.name}</span>
        <ChevronDown className="opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuRadioGroup value={flow.id} onValueChange={(id) => onChange(String(id))}>
          {flows.map((candidate) => (
            <DropdownMenuRadioItem key={candidate.id} value={candidate.id}>
              <span className="truncate">{candidate.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export interface PlayerStageProps {
  diagram: Diagram
  /** The flow to play. Without it, the player plays the first flow. */
  flowId: string | undefined
  onFlowChange: (flowId: string) => void
  /** Leaves the player. Without it, the player shows the diagram name in place of the exit button. */
  onExit?: () => void
  /** Buttons at the end of the header, before the full screen button. */
  actions?: ReactNode
}

/** Plays the flows of a diagram on a read-only canvas, with controls that hide while a flow plays. */
export function PlayerStage({ diagram, flowId, onFlowChange, onExit, actions }: PlayerStageProps) {
  const engine = useEngine()
  const playback = usePlaybackState()
  const initial = useMemo(() => fromDiagram(diagram), [diagram])
  const [nodes, onNodesChange] = useLocalNodes(initial.nodes)
  const [edges, setEdges] = useState<DiagramEdge[]>(initial.edges)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const hideTimer = useRef<number | undefined>(undefined)
  const flow = diagram.flows.find((candidate) => candidate.id === flowId) ?? diagram.flows[0]
  const resolvedTheme = useCanvasTheme(diagram.theme.mode)

  useEffect(() => {
    if (!flow) {
      engine.playback.load(null, null)
      return
    }
    engine.setInsets({ top: 0, right: 0, bottom: CAPTION_HEIGHT_PX, left: 0 })
    engine.playback.load(flow.id, compileFlow(flow, new Set(initial.nodes.map((node) => node.id)), initial.edges))
    engine.playback.setFollow(true)
    if (prefersReducedMotion()) return
    const timer = window.setTimeout(() => engine.playback.play(), 700)
    return () => window.clearTimeout(timer)
  }, [engine, flow, initial])

  const step = useCallback(
    (delta: number) => {
      const timeline = engine.playback.timeline
      if (!timeline || timeline.segments.length === 0) return
      const current = segmentIndexAt(timeline, engine.playback.time.get())
      const nodeSegments = timeline.segments.filter((segment) => segment.step.target.kind === 'node')
      const target =
        delta > 0
          ? nodeSegments.find((segment) => segment.index > current)
          : [...nodeSegments].reverse().find((segment) => segment.index < current)
      engine.playback.pause()
      engine.playback.seek(target ? target.startMs + 1 : delta > 0 ? engine.playback.durationMs : 0)
    },
    [engine],
  )

  const poke = useCallback(() => {
    setControlsVisible(true)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), IDLE_HIDE_MS)
  }, [])

  useEffect(() => {
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), IDLE_HIDE_MS)
    const onKey = (event: KeyboardEvent) => {
      poke()
      if (event.code === 'Space') {
        event.preventDefault()
        engine.playback.toggle()
      } else if (event.key === 'ArrowRight') step(1)
      else if (event.key === 'ArrowLeft') step(-1)
      else if (event.key === 'Escape' && !document.fullscreenElement) onExit?.()
      else if (shortcutLetter(event) === 'f') void toggleFullscreen()
    }
    const onFullscreen = () => setFullscreen(document.fullscreenElement !== null)
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointermove', poke)
    window.addEventListener('pointerdown', poke)
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointermove', poke)
      window.removeEventListener('pointerdown', poke)
      document.removeEventListener('fullscreenchange', onFullscreen)
      window.clearTimeout(hideTimer.current)
    }
  }, [engine, poke, step, onExit])

  const showControls = controlsVisible || !playback.playing

  const exit = async () => {
    if (document.fullscreenElement) await document.exitFullscreen()
    onExit?.()
  }

  return (
    <div className={cn('relative h-full w-full', !showControls && 'cursor-none')}>
      <DiagramCanvas
        nodes={nodes}
        edges={edges}
        theme={{ ...diagram.theme, background: 'none' }}
        resolvedTheme={resolvedTheme}
        editable={false}
        fitView
        fitViewOptions={{ padding: 0.14, maxZoom: 1.2 }}
        onNodesChange={onNodesChange}
        onEdgesChange={(changes: EdgeChange<DiagramEdge>[]) =>
          setEdges((current) => applyEdgeChanges(changes, current))
        }
        nodesFocusable={false}
        edgesFocusable={false}
      />
      <header
        className={cn(
          'dg-titlebar absolute inset-x-0 top-0 z-10 flex h-11 items-center gap-1 border-b bg-panel px-1.5 transition-opacity duration-300',
          showControls ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        {onExit ? (
          <Button variant="ghost" onClick={() => void exit()}>
            <ArrowLeft /> <span className="max-sm:hidden">Exit presentation</span>
            <Kbd className="max-sm:hidden">Esc</Kbd>
          </Button>
        ) : (
          <h1 className="max-w-64 truncate px-2 text-sm font-medium max-sm:hidden">{diagram.name}</h1>
        )}
        <div className={cn('mx-1 h-5 w-px bg-border', !onExit && 'max-sm:hidden')} />
        {flow ? (
          <>
            <FlowPicker flows={diagram.flows} flow={flow} onChange={onFlowChange} />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Restart"
              className="max-sm:hidden"
              onClick={() => engine.playback.seek(0)}
            >
              <SkipBack />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Previous step" onClick={() => step(-1)}>
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={playback.playing ? 'Pause' : 'Play'}
              onClick={() => engine.playback.toggle()}
            >
              {playback.playing ? <Pause /> : <Play />}
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Next step" onClick={() => step(1)}>
              <ChevronRight />
            </Button>
            <div className="mx-2 flex min-w-16 flex-1 sm:min-w-24">
              <Scrubber />
            </div>
          </>
        ) : (
          <span className="flex-1 px-2 text-sm text-muted-foreground">
            This diagram has no flow. The traffic animation plays.
          </span>
        )}
        {actions}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
          onClick={() => void toggleFullscreen()}
        >
          {fullscreen ? <Minimize /> : <Maximize />}
        </Button>
      </header>
    </div>
  )
}
