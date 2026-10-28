import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  SelectionMode,
  type ReactFlowProps,
} from '@xyflow/react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { EngineBinding } from '@/engine/context'
import type { DiagramTheme } from '@/model/schema'
import { GRID_PX } from '@/model/graph'
import type { DiagramEdge, DiagramNode } from '@/model/types'
import { hasDetails } from '@/model/details'
import { FlowEdge } from './edges/FlowEdge'
import { FlowCaption, FlowToken } from './FlowOverlay'
import { GRID_DOT_PX } from './grid'
import { layerNodes } from './layers'
import { CanvasModeContext } from './mode'
import { createDetailsHover } from './details-hover'
import { NodeDetailsCard } from './NodeDetailsCard'
import { CardNode } from './nodes/CardNode'
import { GroupNode } from './nodes/GroupNode'
import { ShapeNode } from './nodes/ShapeNode'
import { TextNode } from './nodes/TextNode'
import { ViewportLayerPortal } from './portal'
import { ZoomProperty } from './zoom'

function nodeHasDetails(node: DiagramNode): boolean {
  return node.type !== 'text' && hasDetails(node.data.details)
}

const nodeTypes = { card: CardNode, shape: ShapeNode, text: TextNode, group: GroupNode }
const edgeTypes = { flow: FlowEdge }

export interface DiagramCanvasProps extends Omit<ReactFlowProps<DiagramNode, DiagramEdge>, 'nodeTypes' | 'edgeTypes'> {
  theme: DiagramTheme
  resolvedTheme: 'dark' | 'light'
  editable: boolean
  exportMode?: boolean
  /** Shows the details of a node on hover and on click, and marks the nodes that have details. */
  details?: boolean
  showCaption?: boolean
  overlay?: ReactNode
  rootRef?: React.RefObject<HTMLDivElement | null>
}

export function DiagramCanvas({
  theme,
  resolvedTheme,
  editable,
  exportMode,
  details = false,
  showCaption = true,
  overlay,
  children,
  rootRef: givenRef,
  ...flowProps
}: DiagramCanvasProps) {
  const ownRef = useRef<HTMLDivElement>(null)
  const rootRef = givenRef ?? ownRef
  const mode = useMemo(() => ({ editable, background: theme.background }), [editable, theme.background])
  const [hover] = useState(createDetailsHover)
  const nodes = useMemo(() => {
    const layered = flowProps.nodes && layerNodes(flowProps.nodes)
    if ((!details && !editable) || !layered) return layered
    return layered.map((node) => {
      const marks = [
        details && nodeHasDetails(node) && 'dg-has-details',
        editable && node.data.pinned === true && 'dg-pinned',
      ].filter(Boolean)
      return marks.length > 0 ? { ...node, className: marks.join(' ') } : node
    })
  }, [flowProps.nodes, details, editable])

  return (
    <CanvasModeContext value={mode}>
      <div
        ref={rootRef}
        className="dg-canvas"
        data-theme={resolvedTheme}
        data-fonts={theme.fonts}
        data-boundary-colors={theme.boundaryColors ? 'true' : undefined}
        data-protocol-colors={theme.protocolColors ? 'true' : undefined}
        data-readonly={editable ? undefined : 'true'}
        data-export={exportMode ? 'true' : undefined}
        data-details={details ? 'true' : undefined}
      >
        <ReactFlow<DiagramNode, DiagramEdge>
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Loose}
          minZoom={0.08}
          maxZoom={4}
          nodesDraggable={editable}
          nodesConnectable={editable}
          elementsSelectable={editable}
          edgesReconnectable={false}
          selectionMode={SelectionMode.Partial}
          deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
          multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
          selectionKeyCode={editable ? 'Shift' : null}
          selectionOnDrag={false}
          panOnDrag={editable ? [0, 1] : true}
          panOnScroll={editable}
          zoomOnDoubleClick={false}
          colorMode={resolvedTheme}
          proOptions={{ hideAttribution: true }}
          {...flowProps}
          {...(details
            ? {
                onNodeMouseEnter: (event, node) => {
                  flowProps.onNodeMouseEnter?.(event, node)
                  if (nodeHasDetails(node)) hover.enter(node.id)
                },
                onNodeMouseLeave: (event, node) => {
                  flowProps.onNodeMouseLeave?.(event, node)
                  hover.leave()
                },
                onNodeClick: (event, node) => {
                  flowProps.onNodeClick?.(event, node)
                  if (nodeHasDetails(node)) hover.toggle(node.id)
                },
                onPaneClick: (event) => {
                  flowProps.onPaneClick?.(event)
                  hover.close()
                },
              }
            : {})}
          nodes={nodes}
        >
          {theme.background === 'dots' && (
            <Background variant={BackgroundVariant.Dots} gap={GRID_PX} size={GRID_DOT_PX} color="var(--dg-grid)" />
          )}
          {theme.background === 'grid' && (
            <Background variant={BackgroundVariant.Lines} gap={GRID_PX} lineWidth={1} color="var(--dg-grid-line)" />
          )}
          <EngineBinding rootRef={rootRef} />
          <ZoomProperty rootRef={rootRef} />
          <ViewportLayerPortal>
            <FlowToken />
          </ViewportLayerPortal>
          {details && <NodeDetailsCard hover={hover} nodes={flowProps.nodes} />}
          {children}
        </ReactFlow>
        {showCaption && <FlowCaption />}
        {overlay}
      </div>
    </CanvasModeContext>
  )
}
