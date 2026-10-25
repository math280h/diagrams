import { ReactFlowProvider, useNodesInitialized, useReactFlow, type Viewport } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CAPTION_HEIGHT_PX } from '@/canvas/FlowOverlay'
import { DiagramCanvas } from '@/canvas/DiagramCanvas'
import { useLocalNodes } from '@/canvas/use-local-nodes'
import { EngineProvider } from '@/engine/context'
import { useEngine } from '@/engine/hooks'
import { Engine } from '@/engine/engine'
import type { DiagramTheme } from '@/model/schema'
import type { DiagramEdge, DiagramNode } from '@/model/types'

export interface StageHandle {
  root: HTMLDivElement
  engine: Engine
  setViewport: (viewport: Viewport) => Promise<boolean>
  fitView: (padding: number) => Promise<boolean>
}

export interface ExportStageProps {
  width: number
  height: number
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  theme: DiagramTheme
  resolvedTheme: 'dark' | 'light'
  viewport: Viewport
  transparent: boolean
  onReady: (stage: StageHandle) => void
}

function StageInner({
  nodes,
  edges,
  theme,
  resolvedTheme,
  viewport,
  transparent,
  onReady,
}: Omit<ExportStageProps, 'width' | 'height'>) {
  const engine = useEngine()
  const { setViewport, fitView } = useReactFlow()
  const initialized = useNodesInitialized()
  const rootRef = useRef<HTMLDivElement>(null)
  const reported = useRef(false)
  const [localNodes, onNodesChange] = useLocalNodes(nodes)

  useEffect(() => {
    if (!initialized || reported.current || !rootRef.current) return
    reported.current = true
    const root = rootRef.current
    onReady({
      root,
      engine,
      setViewport: (next) => setViewport(next),
      fitView: (padding) => fitView({ padding, maxZoom: 1.6 }),
    })
  }, [initialized, engine, onReady, setViewport, fitView])

  return (
    <DiagramCanvas
      rootRef={rootRef}
      nodes={localNodes}
      onNodesChange={onNodesChange}
      edges={edges}
      theme={transparent ? { ...theme, background: 'none' } : theme}
      resolvedTheme={resolvedTheme}
      editable={false}
      exportMode
      defaultViewport={viewport}
      nodesFocusable={false}
      edgesFocusable={false}
      panOnDrag={false}
      zoomOnScroll={false}
      zoomOnPinch={false}
      preventScrolling={false}
      style={transparent ? { background: 'transparent' } : undefined}
    />
  )
}

/**
 * Renders a second, read-only copy of the diagram at a fixed size for capture.
 *
 * The copy has its own React Flow instance and its own engine with manual time.
 */
export function ExportStage({ width, height, ...props }: ExportStageProps) {
  const [engine] = useState(() => {
    const created = new Engine()
    created.manual = true
    created.setInsets({ top: 0, right: 0, bottom: CAPTION_HEIGHT_PX, left: 0 })
    return created
  })
  return createPortal(
    <div
      aria-hidden
      data-transparent={props.transparent ? 'true' : undefined}
      className="dg-export-stage"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width,
        height,
        zIndex: -1,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <ReactFlowProvider>
        <EngineProvider engine={engine}>
          <StageInner {...props} />
        </EngineProvider>
      </ReactFlowProvider>
    </div>,
    document.body,
  )
}
