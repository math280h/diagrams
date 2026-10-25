import { ReactFlowProvider } from '@xyflow/react'
import { useEffect, useMemo } from 'react'
import { useCanvasTheme } from '@/canvas/canvas-theme'
import { useLocalNodes } from '@/canvas/use-local-nodes'
import { DiagramCanvas } from '@/canvas/DiagramCanvas'
import { CAPTION_HEIGHT_PX } from '@/canvas/FlowOverlay'
import { EngineProvider } from '@/engine/context'
import { compileFlow } from '@/engine/flow/compile'
import { useEngine } from '@/engine/hooks'
import { useReducedMotion } from '@/lib/motion'
import type { Diagram } from '@/model/schema'
import { fromDiagram } from '@/persistence/serialize'
import { useReadableFraming } from './use-readable-framing'

export interface LivePreviewProps {
  diagram: Diagram
  /** If true, the first flow plays in a loop and the traffic moves. */
  playing: boolean
  /**
   * The lowest zoom before the view crops the diagram around its busiest node. At 0, the view always shows the whole
   * diagram.
   */
  minZoom?: number
  maxZoom?: number
  paddingPx?: number
  /** If true, the current log line shows in a strip at the bottom. */
  showCaption?: boolean
}

function PreviewCanvas({ diagram, playing, minZoom, maxZoom, paddingPx, showCaption }: Required<LivePreviewProps>) {
  const engine = useEngine()
  const reducedMotion = useReducedMotion()
  const initial = useMemo(() => fromDiagram(diagram), [diagram])
  const [nodes, onNodesChange] = useLocalNodes(initial.nodes)
  const resolvedTheme = useCanvasTheme(diagram.theme.mode)
  const flow = diagram.flows[0]
  const framed = useReadableFraming({
    edges: initial.edges,
    paddingPx,
    minZoom,
    maxZoom,
    bottomInsetPx: showCaption ? CAPTION_HEIGHT_PX : 0,
  })

  useEffect(() => {
    engine.ambient.setRunning(playing && !reducedMotion)
    if (!playing || !flow) {
      engine.playback.load(null, null)
      return
    }
    const looping = { ...flow, loop: true, spotlight: false }
    engine.playback.load(flow.id, compileFlow(looping, new Set(initial.nodes.map((node) => node.id)), initial.edges))
    engine.playback.setFollow(false)
    engine.playback.play()
  }, [engine, playing, flow, initial, reducedMotion])

  return (
    <div className="h-full w-full transition-opacity duration-300" style={{ opacity: framed ? 1 : 0 }}>
      <DiagramCanvas
        nodes={nodes}
        edges={initial.edges}
        theme={{ ...diagram.theme, background: 'none' }}
        resolvedTheme={resolvedTheme}
        editable={false}
        showCaption={showCaption}
        onNodesChange={onNodesChange}
        nodesFocusable={false}
        edgesFocusable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        preventScrolling={false}
      />
    </div>
  )
}

/** Renders a read-only, live copy of a diagram, framed so that its text stays readable. */
export function LivePreview({
  diagram,
  playing,
  minZoom = 0.55,
  maxZoom = 1,
  paddingPx = 24,
  showCaption = false,
}: LivePreviewProps) {
  return (
    <div className="dg-preview pointer-events-none h-full w-full" aria-hidden>
      <ReactFlowProvider>
        <EngineProvider running={playing}>
          <PreviewCanvas
            diagram={diagram}
            playing={playing}
            minZoom={minZoom}
            maxZoom={maxZoom}
            paddingPx={paddingPx}
            showCaption={showCaption}
          />
        </EngineProvider>
      </ReactFlowProvider>
    </div>
  )
}
