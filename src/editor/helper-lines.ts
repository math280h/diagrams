import type { NodePositionChange } from '@xyflow/react'
import { absoluteRect } from '@/model/graph'
import type { DiagramNode } from '@/model/types'

export interface HelperLines {
  /** The x coordinate of the vertical guide in canvas coordinates. */
  vertical?: number
  /** The y coordinate of the horizontal guide in canvas coordinates. */
  horizontal?: number
  snapX?: number
  snapY?: number
}

const DISTANCE = 6

/**
 * Finds alignment guides for one dragged node.
 *
 * The function compares the left, centre and right lines, and the top, middle and bottom lines, of the node. It
 * compares them with the same lines of the other nodes that have the same parent.
 *
 * @returns The guides, and the snapped position in the coordinates of the node parent.
 */
export function getHelperLines(change: NodePositionChange, nodes: DiagramNode[]): HelperLines {
  const node = nodes.find((candidate) => candidate.id === change.id)
  if (!node || !change.position) return {}
  const byId = new Map(nodes.map((candidate) => [candidate.id, candidate]))
  const rect = absoluteRect({ ...node, position: change.position }, byId)
  const offsetX = rect.x - change.position.x
  const offsetY = rect.y - change.position.y
  const xs = [rect.x, rect.x + rect.width / 2, rect.x + rect.width]
  const ys = [rect.y, rect.y + rect.height / 2, rect.y + rect.height]
  let bestX: { distance: number; line: number; shift: number } | null = null
  let bestY: { distance: number; line: number; shift: number } | null = null

  for (const other of nodes) {
    if (other.id === node.id || other.parentId !== node.parentId || other.type === 'group') continue
    const target = absoluteRect(other, byId)
    const targetXs = [target.x, target.x + target.width / 2, target.x + target.width]
    const targetYs = [target.y, target.y + target.height / 2, target.y + target.height]
    for (const x of xs) {
      for (const line of targetXs) {
        const distance = Math.abs(x - line)
        if (distance < DISTANCE && (!bestX || distance < bestX.distance)) bestX = { distance, line, shift: line - x }
      }
    }
    for (const y of ys) {
      for (const line of targetYs) {
        const distance = Math.abs(y - line)
        if (distance < DISTANCE && (!bestY || distance < bestY.distance)) bestY = { distance, line, shift: line - y }
      }
    }
  }

  return {
    vertical: bestX?.line,
    horizontal: bestY?.line,
    snapX: bestX ? rect.x + bestX.shift - offsetX : undefined,
    snapY: bestY ? rect.y + bestY.shift - offsetY : undefined,
  }
}
