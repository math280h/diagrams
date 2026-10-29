import { applyEdgeChanges, useReactFlow, type EdgeChange } from '@xyflow/react'
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
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
import { ShortcutTooltip } from '@/components/ShortcutTooltip'
import { KEYS } from '@/lib/shortcut-keys'
import { useEngine, usePlaybackState } from '@/engine/hooks'
import { compileFlow } from '@/engine/flow/compile'
import { stepFlow } from '@/engine/flow/step'
import { StepCount } from '@/components/StepCount'
import { hasDetails } from '@/model/details'
import { toast } from 'sonner'
import { shortcutLetter } from '@/lib/keys'
import { prefersReducedMotion } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { Diagram, Flow } from '@/model/schema'
import type { DiagramEdge } from '@/model/types'
import { fromDiagram } from '@/persistence/serialize'
import { Scrubber } from './Scrubber'
import { describeDiagram } from '@/export/describe'
import { findPath } from '@/model/flow'
import { ExploreStrip } from './ExploreStrip'
import { useExplore } from './use-explore'

const IDLE_HIDE_MS = 2600
const TOP_BAR_HEIGHT_PX = 44
const DETAILS_HINT_KEY = 'dg:details-hint-shown'

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null
  } catch {
    return true
  }
}

function writeFlag(key: string) {
  try {
    localStorage.setItem(key, '1')
  } catch {
    // Browsers can block storage, for example in a private window.
  }
}
const OPEN_ZOOM_MS = 650

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

const MAIN_PATH = 'main'

function PathPicker({
  flow,
  pathId,
  onChange,
}: {
  flow: Flow
  pathId: string | null
  onChange: (pathId: string | null) => void
}) {
  const paths = (flow.paths ?? []).filter((path) => path.steps.length > 0)
  if (paths.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="max-w-44 max-sm:max-w-28"
            aria-label={`Path: ${findPath(flow, pathId)?.name ?? 'Main path'}`}
          />
        }
      >
        <span className="truncate">{findPath(flow, pathId)?.name ?? 'Main path'}</span>
        <ChevronDown className="opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuRadioGroup
          value={pathId ?? MAIN_PATH}
          onValueChange={(id) => onChange(id === MAIN_PATH ? null : String(id))}
        >
          <DropdownMenuRadioItem value={MAIN_PATH}>Main path</DropdownMenuRadioItem>
          {paths.map((path) => (
            <DropdownMenuRadioItem key={path.id} value={path.id}>
              <span className="truncate">{path.name}</span>
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
  /** Opens the diagram that a node leads to, after the camera zooms into the node. */
  onOpenDiagram?: (diagramId: string) => void
  /** A way back to the diagram that led here. */
  back?: { label: string; onClick: () => void }
}

/** Plays the flows of a diagram on a read-only canvas, with controls that hide while a flow plays. */
export function PlayerStage({ diagram, flowId, onFlowChange, onExit, actions, onOpenDiagram, back }: PlayerStageProps) {
  const engine = useEngine()
  const playback = usePlaybackState()
  const initial = useMemo(() => fromDiagram(diagram), [diagram])
  const description = useMemo(
    () => describeDiagram({ ...initial, name: diagram.name, flows: diagram.flows }),
    [initial, diagram],
  )
  const [nodes, onNodesChange] = useLocalNodes(initial.nodes)
  const [edges, setEdges] = useState<DiagramEdge[]>(initial.edges)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const hideTimer = useRef<number | undefined>(undefined)
  const flow = diagram.flows.find((candidate) => candidate.id === flowId) ?? diagram.flows[0]
  const [pathChoice, setPathChoice] = useState<{ flowId: string; pathId: string | null } | null>(null)
  const pathId = flow && pathChoice?.flowId === flow.id ? (findPath(flow, pathChoice.pathId)?.id ?? null) : null
  const resolvedTheme = useCanvasTheme(diagram.theme.mode)
  const { fitBounds, getInternalNode } = useReactFlow()
  const [leaving, setLeaving] = useState(false)
  const explore = useExplore(nodes, edges, TOP_BAR_HEIGHT_PX)
  const exploring = explore.active
  const backFromExplore = useRef(false)

  const openDiagram = useCallback(
    (diagramId: string, nodeId: string) => {
      if (!onOpenDiagram) return
      engine.playback.pause()
      const node = getInternalNode(nodeId)
      const durationMs = prefersReducedMotion() || !node ? 0 : OPEN_ZOOM_MS
      if (node) {
        const { x, y } = node.internals.positionAbsolute
        void fitBounds(
          { x, y, width: node.measured.width ?? 0, height: node.measured.height ?? 0 },
          { duration: durationMs, padding: 0.02 },
        )
      }
      setLeaving(true)
      window.setTimeout(() => onOpenDiagram(diagramId), durationMs)
    },
    [engine, fitBounds, getInternalNode, onOpenDiagram],
  )

  useEffect(() => {
    if (!flow || exploring) {
      engine.playback.load(null, null)
      if (exploring) backFromExplore.current = true
      return
    }
    engine.setInsets({ top: TOP_BAR_HEIGHT_PX, right: 0, bottom: CAPTION_HEIGHT_PX, left: 0 })
    engine.playback.load(
      flow.id,
      compileFlow(flow, new Set(initial.nodes.map((node) => node.id)), initial.edges, pathId),
    )
    engine.playback.setFollow(true)
    if (backFromExplore.current) {
      backFromExplore.current = false
      return
    }
    if (prefersReducedMotion()) return
    const timer = window.setTimeout(() => engine.playback.play(), 700)
    return () => window.clearTimeout(timer)
  }, [engine, flow, initial, pathId, exploring])

  const toggleExplore = useCallback(() => {
    if (exploring) explore.stop()
    else {
      engine.playback.pause()
      explore.start()
    }
  }, [engine, explore, exploring])

  const step = useCallback((delta: 1 | -1) => stepFlow(engine, delta), [engine])

  useEffect(() => {
    if (!initial.nodes.some((node) => node.type !== 'text' && hasDetails(node.data.details))) return
    if (readFlag(DETAILS_HINT_KEY)) return
    writeFlag(DETAILS_HINT_KEY)
    toast.message('A dot on a node means it has details. Point at the node or click it to read them.')
  }, [initial])

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
      else if (event.key === 'Escape' && exploring) explore.stop()
      else if (event.key === 'Escape' && !document.fullscreenElement) onExit?.()
      else if (shortcutLetter(event) === 'f') void toggleFullscreen()
      else if (shortcutLetter(event) === 'e') toggleExplore()
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
  }, [engine, poke, step, onExit, exploring, explore, toggleExplore])

  const showControls = controlsVisible || !playback.playing

  const exit = async () => {
    if (document.fullscreenElement) await document.exitFullscreen()
    onExit?.()
  }

  return (
    <div
      className={cn(
        'relative h-full w-full transition-opacity duration-300',
        !showControls && 'cursor-none',
        leaving && 'opacity-0',
      )}
    >
      <main className="h-full w-full">
        <DiagramCanvas
          nodes={explore.nodes}
          edges={explore.edges}
          exploring={exploring}
          onNodeClick={explore.onNodeClick}
          theme={{ ...diagram.theme, background: 'none' }}
          resolvedTheme={resolvedTheme}
          editable={false}
          details
          onOpenDiagram={onOpenDiagram ? openDiagram : undefined}
          fitView
          fitViewOptions={{ padding: 0.14, maxZoom: 1.2 }}
          onNodesChange={onNodesChange}
          onEdgesChange={(changes: EdgeChange<DiagramEdge>[]) =>
            setEdges((current) => applyEdgeChanges(changes, current))
          }
          nodesFocusable={false}
          edgesFocusable={false}
          description={description}
        />
      </main>
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
        {back && (
          <Button variant="ghost" size="sm" onClick={back.onClick} className="max-w-48">
            <ArrowLeft /> <span className="truncate">{back.label}</span>
          </Button>
        )}
        <div className={cn('mx-1 h-5 w-px bg-border', !onExit && 'max-sm:hidden')} />
        {exploring ? (
          <span className="flex-1 truncate px-2 text-sm text-muted-foreground">
            Exploring. Click a node, or a neighbour below, to move.
          </span>
        ) : flow ? (
          <>
            <FlowPicker flows={diagram.flows} flow={flow} onChange={onFlowChange} />
            <PathPicker
              flow={flow}
              pathId={pathId}
              onChange={(next) => setPathChoice({ flowId: flow.id, pathId: next })}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Restart"
              className="max-sm:hidden"
              onClick={() => engine.playback.seek(0)}
            >
              <SkipBack />
            </Button>
            <ShortcutTooltip label="Previous step" keys={KEYS.previousStep}>
              <Button variant="ghost" size="icon-sm" aria-label="Previous step" onClick={() => step(-1)}>
                <ChevronLeft />
              </Button>
            </ShortcutTooltip>
            <ShortcutTooltip label={playback.playing ? 'Pause' : 'Play'} keys={KEYS.playPause}>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={playback.playing ? 'Pause' : 'Play'}
                onClick={() => engine.playback.toggle()}
              >
                {playback.playing ? <Pause /> : <Play />}
              </Button>
            </ShortcutTooltip>
            <ShortcutTooltip label="Next step" keys={KEYS.nextStep}>
              <Button variant="ghost" size="icon-sm" aria-label="Next step" onClick={() => step(1)}>
                <ChevronRight />
              </Button>
            </ShortcutTooltip>
            <StepCount className="ml-1 max-sm:hidden" />
            <div className="mx-2 flex min-w-16 flex-1 sm:min-w-24">
              <Scrubber />
            </div>
          </>
        ) : (
          <span className="flex-1 px-2 text-sm text-muted-foreground">
            {initial.nodes.length === 0
              ? 'This diagram is empty.'
              : initial.edges.some((edge) => edge.data?.traffic.enabled)
                ? 'This diagram has no flow. The traffic animation plays.'
                : 'This diagram has no flow to play.'}
          </span>
        )}
        {actions}
        {initial.nodes.length > 0 && (
          <ShortcutTooltip label={exploring ? 'Stop exploring' : 'Explore'} keys={KEYS.explore}>
            <Button
              variant={exploring ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-label="Explore"
              aria-pressed={exploring}
              onClick={toggleExplore}
            >
              <Compass />
            </Button>
          </ShortcutTooltip>
        )}
        <ShortcutTooltip label={fullscreen ? 'Exit full screen' : 'Full screen'} keys={KEYS.fullScreen}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? <Minimize /> : <Maximize />}
          </Button>
        </ShortcutTooltip>
      </header>
      <ExploreStrip explore={explore} />
    </div>
  )
}
