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
import type { DiagramDescription } from '@/export/describe'
import type { DataCrossing } from '@/model/threats'
import { useHighContrast } from '@/store/settings-store'
import { CanvasDescription } from './CanvasDescription'
import { edgeAriaLabel, nodeAriaLabel, nodeName } from './aria'
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
import { LevelOfDetail } from './level-of-detail'
import { createRouteStore, EdgeRouter, RouteStoreContext } from './edges/routing'
import { StepNumbers } from './StepNumbers'
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
  /** Opens the diagram that a node leads to. Without it, nodes show no open button. */
  onOpenDiagram?: (diagramId: string, nodeId: string) => void
  showCaption?: boolean
  /** The text that screen readers read for the diagram. */
  description?: DiagramDescription
  /** The edges that carry sensitive fields, by edge id. With it, the canvas marks them and dims the other edges. */
  threats?: ReadonlyMap<string, DataCrossing>
  overlay?: ReactNode
  rootRef?: React.RefObject<HTMLDivElement | null>
  /** If true, cards show less detail and larger titles when the zoom is low (`data-lod`). */
  levelOfDetail?: boolean
  /** If true, the canvas dims the nodes and edges without the `dg-explore-near` class. */
  exploring?: boolean
}

export function DiagramCanvas({
  theme,
  resolvedTheme,
  editable,
  exportMode,
  details = false,
  onOpenDiagram,
  showCaption = true,
  description,
  threats,
  overlay,
  children,
  rootRef: givenRef,
  levelOfDetail = false,
  exploring = false,
  ...flowProps
}: DiagramCanvasProps) {
  const ownRef = useRef<HTMLDivElement>(null)
  const rootRef = givenRef ?? ownRef
  const mode = useMemo(
    () => ({
      editable,
      background: theme.background,
      openDiagram: onOpenDiagram,
      threats,
      snap: theme.snap,
      routeAround: theme.routeAround,
    }),
    [editable, theme.background, onOpenDiagram, threats, theme.snap, theme.routeAround],
  )
  const [routes] = useState(createRouteStore)
  const [hover] = useState(createDetailsHover)
  const highContrast = useHighContrast() && !exportMode
  const nodes = useMemo(() => {
    const layered = flowProps.nodes && layerNodes(flowProps.nodes)
    return layered?.map((node) => {
      const marks = [
        details && nodeHasDetails(node) && 'dg-has-details',
        editable && node.data.pinned === true && 'dg-pinned',
      ].filter(Boolean)
      const className = [node.className, ...marks].filter(Boolean).join(' ')
      return {
        ...node,
        ariaRole: 'group' as const,
        ariaLabel: nodeAriaLabel(node),
        ...(className ? { className } : {}),
      }
    })
  }, [flowProps.nodes, details, editable])
  const edges = useMemo(() => {
    const names = new Map(flowProps.nodes?.map((node) => [node.id, nodeName(node)]))
    const nameOf = (id: string) => names.get(id) ?? 'a missing node'
    return flowProps.edges?.map((edge) => ({ ...edge, ariaLabel: edgeAriaLabel(edge, nameOf) }))
  }, [flowProps.nodes, flowProps.edges])

  return (
    <CanvasModeContext value={mode}>
      <RouteStoreContext value={routes}>
        <div
          ref={rootRef}
          className="dg-canvas"
          data-theme={resolvedTheme}
          data-contrast={highContrast ? 'more' : undefined}
          data-fonts={theme.fonts}
          data-boundary-colors={theme.boundaryColors ? 'true' : undefined}
          data-protocol-colors={theme.protocolColors ? 'true' : undefined}
          data-readonly={editable ? undefined : 'true'}
          data-export={exportMode ? 'true' : undefined}
          data-details={details ? 'true' : undefined}
          data-threats={threats ? 'true' : undefined}
          data-exploring={exploring ? 'true' : undefined}
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
            edges={edges}
          >
            {theme.background === 'dots' && (
              <Background variant={BackgroundVariant.Dots} gap={GRID_PX} size={GRID_DOT_PX} color="var(--dg-grid)" />
            )}
            {theme.background === 'grid' && (
              <Background variant={BackgroundVariant.Lines} gap={GRID_PX} lineWidth={1} color="var(--dg-grid-line)" />
            )}
            {theme.routeAround && <EdgeRouter store={routes} />}
            <EngineBinding rootRef={rootRef} />
            <ZoomProperty rootRef={rootRef} />
            {levelOfDetail && <LevelOfDetail rootRef={rootRef} />}
            <ViewportLayerPortal>
              <StepNumbers />
              <FlowToken />
            </ViewportLayerPortal>
            {details && <NodeDetailsCard hover={hover} nodes={flowProps.nodes} />}
            {children}
          </ReactFlow>
          {description && <CanvasDescription description={description} />}
          {showCaption && <FlowCaption />}
          {overlay}
        </div>
      </RouteStoreContext>
    </CanvasModeContext>
  )
}
