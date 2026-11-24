import { ReactFlowProvider } from '@xyflow/react'
import { useEffect, useMemo } from 'react'
import { useActiveTheme } from '@/themes/active'
import { useLocalNodes } from '@/canvas/use-local-nodes'
import { DiagramCanvas } from '@/canvas/DiagramCanvas'
import { captionSpace } from '@/canvas/caption-space'
import { EngineProvider } from '@/engine/context'
import { compileFlow } from '@/engine/flow/compile'
import { useEngine } from '@/engine/hooks'
import { useReducedMotion } from '@/lib/motion'
import type { Diagram } from '@/model/schema'
import type { DataCrossing } from '@/model/threats'
import { fromDiagram } from '@/persistence/serialize'
import { useReadableFraming } from './use-readable-framing'

export interface LivePreviewProps {
  diagram: Diagram
  /** If true, the first flow plays in a loop and the traffic moves. */
  playing: boolean
  /** If true, the flow and the traffic stop where they are. */
  paused?: boolean
  /**
   * The lowest zoom before the view crops the diagram around its busiest node. At 0, the view always shows the whole
   * diagram.
   */
  minZoom?: number
  maxZoom?: number
  paddingPx?: number
  /** If true, the caption of the current step shows in the caption style of the flow. */
  showCaption?: boolean
  /** The connections that carry sensitive data across a trust boundary, by edge id, to highlight. */
  threats?: ReadonlyMap<string, DataCrossing>
  /** If true, the canvas shows less detail and larger titles when the zoom is low. */
  levelOfDetail?: boolean
}

function PreviewCanvas({
  diagram,
  playing,
  paused,
  minZoom,
  maxZoom,
  paddingPx,
  showCaption,
  threats,
  levelOfDetail,
}: Required<Omit<LivePreviewProps, 'threats'>> & Pick<LivePreviewProps, 'threats'>) {
  const engine = useEngine()
  const reducedMotion = useReducedMotion()
  const initial = useMemo(() => fromDiagram(diagram), [diagram])
  const [nodes, onNodesChange] = useLocalNodes(initial.nodes)
  const colorTheme = useActiveTheme()
  const flow = diagram.flows[0]
  const timeline = useMemo(
    () =>
      flow
        ? compileFlow(
            { ...flow, loop: true, spotlight: false },
            new Set(initial.nodes.map((node) => node.id)),
            initial.edges,
          )
        : null,
    [flow, initial],
  )
  const space = showCaption ? captionSpace(timeline) : { top: 0, bottom: 0 }
  const framed = useReadableFraming({
    edges: initial.edges,
    paddingPx,
    minZoom,
    maxZoom,
    bottomInsetPx: space.bottom,
    topInsetPx: space.top,
  })

  useEffect(() => {
    engine.setInsets({ top: space.top, right: 0, bottom: space.bottom, left: 0 })
  }, [engine, space.top, space.bottom])

  useEffect(() => {
    engine.ambient.setRunning(playing && !paused && !reducedMotion)
  }, [engine, playing, paused, reducedMotion])

  useEffect(() => {
    if (!playing || !timeline) {
      engine.playback.load(null, null)
      return
    }
    engine.playback.load(timeline.flow.id, timeline)
    engine.playback.setFollow(false)
  }, [engine, playing, timeline])

  useEffect(() => {
    if (!playing || !flow) return
    if (paused) engine.playback.pause()
    else engine.playback.play()
  }, [engine, playing, paused, flow])

  return (
    <div className="h-full w-full transition-opacity duration-300" style={{ opacity: framed ? 1 : 0 }}>
      <DiagramCanvas
        nodes={nodes}
        edges={initial.edges}
        theme={{ ...diagram.theme, background: 'none' }}
        colorTheme={colorTheme}
        editable={false}
        showCaption={showCaption}
        threats={threats}
        levelOfDetail={levelOfDetail}
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
  paused = false,
  minZoom = 0.55,
  maxZoom = 1,
  paddingPx = 24,
  showCaption = false,
  threats,
  levelOfDetail = false,
}: LivePreviewProps) {
  return (
    <div className="dg-preview pointer-events-none h-full w-full" aria-hidden>
      <ReactFlowProvider>
        <EngineProvider running={playing}>
          <PreviewCanvas
            diagram={diagram}
            playing={playing}
            paused={paused}
            minZoom={minZoom}
            maxZoom={maxZoom}
            paddingPx={paddingPx}
            showCaption={showCaption}
            threats={threats}
            levelOfDetail={levelOfDetail}
          />
        </EngineProvider>
      </ReactFlowProvider>
    </div>
  )
}
