import {
  useReactFlow,
  useStore,
  type FinalConnectionState,
  type NodeChange,
  type OnSelectionChangeParams,
  type Viewport,
} from '@xyflow/react'
import { Minimap, MINIMAP_MIN_NODES } from '@/canvas/Minimap'
import { useSettings } from '@/store/settings-store'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useCanvasTheme } from '@/canvas/canvas-theme'
import { DiagramCanvas } from '@/canvas/DiagramCanvas'
import { useDiagramDescription } from '@/export/use-description'
import { dataCrossings } from '@/model/threats'
import type { DiagramNode } from '@/model/types'
import {
  addNodes,
  moveBendsAfterDrag,
  onConnect,
  onEdgesChange,
  onNodesChange,
  reparentAfterDrag,
  selectOnly,
  setViewport,
  snapAfterDrag,
} from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { beginGesture, endGesture } from '@/store/history'
import { setUi, useUi } from '@/store/ui-store'
import { useVersions } from '@/store/versions'
import { CanvasContextMenu, type ContextTarget } from './CanvasContextMenu'
import { EmptyCanvas } from './EmptyCanvas'
import { appendNodeToFlow, appendParallelNode } from './flow/record'
import { getHelperLines, type HelperLines } from './helper-lines'
import { PRESET_MIME, presetNodeAt } from './preset-node'
import { RecoverViewport } from './RecoverViewport'
import { StartFrame } from './StartFrame'
import { editorFit, NARROW_SCREEN_PX } from './fit'
import { bindInsertProjection } from './insert'
import { lastPointer } from './pointer'
import { ZoomControls } from './ZoomControls'
import { useNavigate } from '@tanstack/react-router'
import { flushPendingSave } from '@/store/document'

function isDefaultViewport(viewport: Viewport): boolean {
  return viewport.x === 0 && viewport.y === 0 && viewport.zoom === 1
}

function HelperLinesOverlay({ lines }: { lines: HelperLines }) {
  const [x, y, zoom] = useStore((state) => state.transform)
  return (
    <>
      {lines.vertical !== undefined && (
        <div className="dg-helper-line" style={{ left: lines.vertical * zoom + x, top: 0, bottom: 0, width: 1 }} />
      )}
      {lines.horizontal !== undefined && (
        <div className="dg-helper-line" style={{ top: lines.horizontal * zoom + y, left: 0, right: 0, height: 1 }} />
      )}
    </>
  )
}

export function EditorCanvas() {
  const nodes = useDoc((state) => state.nodes)
  const edges = useDoc((state) => state.edges)
  const theme = useDoc((state) => state.theme)
  const [initialViewport] = useState(() => useDoc.getState().viewport)
  const [narrow] = useState(() => window.innerWidth < NARROW_SCREEN_PX)
  const resolvedTheme = useCanvasTheme(theme.mode)
  const description = useDiagramDescription()
  const sensitiveView = useUi((state) => state.sensitiveView)
  const showMinimap = useSettings((state) => state.showMinimap)
  const threats = useMemo(
    () =>
      sensitiveView ? new Map(dataCrossings(nodes, edges).map((crossing) => [crossing.edgeId, crossing])) : undefined,
    [sensitiveView, nodes, edges],
  )
  const recording = useUi((state) => state.recording)
  const previewing = useVersions((state) => state.previewId !== null)
  const [lines, setLines] = useState<HelperLines>({})
  const [dragging, setDragging] = useState(false)
  const [contextTarget, setContextTarget] = useState<ContextTarget>({ kind: 'pane' })
  const { screenToFlowPosition } = useReactFlow()
  const navigate = useNavigate()
  const openDiagram = useCallback(
    (diagramId: string) => {
      flushPendingSave()
      void navigate({ to: '/d/$diagramId', params: { diagramId } })
    },
    [navigate],
  )

  useEffect(() => {
    bindInsertProjection(screenToFlowPosition)
    return () => bindInsertProjection(null)
  }, [screenToFlowPosition])

  const handleNodesChange = useCallback(
    (changes: NodeChange<DiagramNode>[]) => {
      const [first] = changes
      if (changes.length === 1 && first?.type === 'position' && first.dragging && first.position) {
        const found = getHelperLines(first, useDoc.getState().nodes)
        first.position = { x: found.snapX ?? first.position.x, y: found.snapY ?? first.position.y }
        setLines(found)
      } else if (lines.vertical !== undefined || lines.horizontal !== undefined) {
        setLines({})
      }
      onNodesChange(changes)
    },
    [lines],
  )

  const dragStart = useRef<DiagramNode[]>([])

  const onDragStart = useCallback(() => {
    beginGesture()
    dragStart.current = useDoc.getState().nodes
    setDragging(true)
  }, [])

  const onDragStop = useCallback((_: unknown, __: unknown, dragged: DiagramNode[]) => {
    const ids = dragged.map((node) => node.id)
    snapAfterDrag(ids)
    reparentAfterDrag(ids)
    moveBendsAfterDrag(dragStart.current)
    endGesture()
    setLines({})
    setDragging(false)
  }, [])

  const onDrop = (event: DragEvent) => {
    const presetId = event.dataTransfer.getData(PRESET_MIME)
    if (!presetId) return
    event.preventDefault()
    const node = presetNodeAt(presetId, screenToFlowPosition({ x: event.clientX, y: event.clientY }))
    if (node) addNodes([node])
  }

  const onConnectEnd = (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromNode) return
    const point = 'changedTouches' in event ? event.changedTouches[0]! : event
    setUi({
      insert: {
        sourceId: state.fromNode.id,
        screen: { x: point.clientX, y: point.clientY },
        flow: screenToFlowPosition({ x: point.clientX, y: point.clientY }),
      },
    })
  }

  const onDoubleClick = (event: React.MouseEvent) => {
    if (!(event.target instanceof Element) || !event.target.classList.contains('react-flow__pane')) return
    setUi({
      insert: {
        screen: { x: event.clientX, y: event.clientY },
        flow: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      },
    })
  }

  const onSelectionChange = useCallback(({ nodes: selectedNodes }: OnSelectionChangeParams) => {
    if (selectedNodes.length > 0) useUi.setState({ selectedStepId: null })
  }, [])

  return (
    <div
      inert={previewing}
      data-editor-canvas
      data-dragging={dragging ? 'true' : undefined}
      className="absolute inset-0"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      onPointerMove={(event) => lastPointer.set(event.clientX, event.clientY)}
      onDoubleClick={onDoubleClick}
    >
      <CanvasContextMenu target={contextTarget}>
        <DiagramCanvas
          nodes={nodes}
          edges={edges}
          theme={theme}
          resolvedTheme={resolvedTheme}
          editable={!previewing}
          levelOfDetail
          onOpenDiagram={openDiagram}
          showCaption={false}
          description={description}
          threats={threats}
          defaultViewport={initialViewport}
          fitView={nodes.length > 0 && isDefaultViewport(initialViewport) && !narrow}
          fitViewOptions={editorFit()}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onNodeDragStart={onDragStart}
          onNodeDragStop={onDragStop}
          onSelectionDragStart={onDragStart}
          onSelectionDragStop={(event, dragged) => onDragStop(event, null, dragged)}
          onSelectionChange={onSelectionChange}
          onMoveEnd={(event, viewport) => {
            if (event) setViewport(viewport)
          }}
          onNodeClick={(event, node) => {
            if (!recording) return
            if (event.shiftKey) appendParallelNode(node.id)
            else appendNodeToFlow(node.id)
          }}
          onPaneContextMenu={() => setContextTarget({ kind: 'pane' })}
          onNodeContextMenu={(_, node) => {
            if (!node.selected) selectOnly([node.id])
            setContextTarget({ kind: 'node', id: node.id })
          }}
          onEdgeContextMenu={(_, edge) => {
            if (!edge.selected) selectOnly([], [edge.id])
            setContextTarget({ kind: 'edge', id: edge.id })
          }}
          onSelectionContextMenu={() => setContextTarget({ kind: 'selection' })}
          overlay={<HelperLinesOverlay lines={lines} />}
        >
          <RecoverViewport />
          {narrow && <StartFrame />}
          {showMinimap && nodes.length >= MINIMAP_MIN_NODES && <Minimap />}
        </DiagramCanvas>
      </CanvasContextMenu>
      {nodes.length === 0 && <EmptyCanvas />}
      <ZoomControls />
    </div>
  )
}
