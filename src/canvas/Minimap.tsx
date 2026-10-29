import { MiniMap } from '@xyflow/react'
import type { DiagramNode } from '@/model/types'

/** The number of nodes from which a diagram gets a minimap. */
export const MINIMAP_MIN_NODES = 20

function nodeColor(node: DiagramNode) {
  return node.type === 'group' || node.type === 'text' ? 'transparent' : 'var(--dg-minimap-node)'
}

function nodeStrokeColor(node: DiagramNode) {
  return node.type === 'group' ? 'var(--dg-minimap-node)' : 'transparent'
}

/**
 * Renders an overview of the whole diagram in a corner of the canvas. Drag it to pan, scroll it to zoom.
 *
 * Put this component inside the `ReactFlow` element.
 */
export function Minimap() {
  return (
    <MiniMap<DiagramNode>
      pannable
      zoomable
      ariaLabel="Minimap"
      position="bottom-right"
      className="dg-minimap max-md:hidden"
      nodeColor={nodeColor}
      nodeStrokeColor={nodeStrokeColor}
      nodeStrokeWidth={6}
      nodeBorderRadius={6}
      maskColor="var(--dg-minimap-mask)"
      bgColor="var(--dg-panel)"
    />
  )
}
