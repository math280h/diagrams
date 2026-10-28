import { useDeferredValue, useMemo } from 'react'
import { useDoc } from '@/store/doc-store'
import { describeDiagram, type DiagramDescription } from './describe'

/** Returns the description of the open diagram. It follows a node drag a little later than the canvas. */
export function useDiagramDescription(): DiagramDescription {
  const name = useDoc((state) => state.name)
  const nodes = useDeferredValue(useDoc((state) => state.nodes))
  const edges = useDoc((state) => state.edges)
  const flows = useDoc((state) => state.flows)
  return useMemo(() => describeDiagram({ name, nodes, edges, flows }), [name, nodes, edges, flows])
}
