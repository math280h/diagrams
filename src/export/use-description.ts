import { useDeferredValue, useMemo, useState } from 'react'
import type { DiagramNode } from '@/model/types'
import { useDoc, type DocState } from '@/store/doc-store'
import { describeDiagram, type DiagramDescription } from './describe'

function settledNodes(): (state: DocState) => DiagramNode[] {
  let settled: DiagramNode[] | null = null
  return (state) => {
    if (settled === null || !state.nodes.some((node) => node.dragging === true)) settled = state.nodes
    return settled
  }
}

/**
 * Returns the description of the open diagram. It changes when a node drag ends, not during the drag.
 *
 * @returns The same object while the text of the description does not change.
 */
export function useDiagramDescription(): DiagramDescription {
  const [selectNodes] = useState(settledNodes)
  const name = useDoc((state) => state.name)
  const nodes = useDeferredValue(useDoc(selectNodes))
  const edges = useDoc((state) => state.edges)
  const flows = useDoc((state) => state.flows)
  const json = useMemo(
    () => JSON.stringify(describeDiagram({ name, nodes, edges, flows })),
    [name, nodes, edges, flows],
  )
  return useMemo((): DiagramDescription => JSON.parse(json), [json])
}
