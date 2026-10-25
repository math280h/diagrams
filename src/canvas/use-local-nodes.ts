import { applyNodeChanges, type NodeChange } from '@xyflow/react'
import { useCallback, useState } from 'react'
import type { DiagramNode } from '@/model/types'

/**
 * Keeps a copy of the nodes of a read-only canvas. React Flow stores the sizes that it measures in this copy.
 *
 * The copy starts again from `nodes` when `nodes` is a new array.
 *
 * @returns The nodes to show and the `onNodesChange` handler for the canvas.
 */
export function useLocalNodes(nodes: DiagramNode[]) {
  const [local, setLocal] = useState({ source: nodes, nodes })
  if (local.source !== nodes) setLocal({ source: nodes, nodes })
  const onNodesChange = useCallback(
    (changes: NodeChange<DiagramNode>[]) =>
      setLocal((current) => ({ ...current, nodes: applyNodeChanges(changes, current.nodes) })),
    [],
  )
  return [local.nodes, onNodesChange] as const
}
