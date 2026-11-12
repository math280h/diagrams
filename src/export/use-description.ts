import { useDeferredValue, useMemo } from 'react'
import { useDoc } from '@/store/doc-store'
import { describeDiagram, type DiagramDescription } from './describe'

/**
 * Returns the description of the open diagram. It follows a node drag a little later than the canvas.
 *
 * @returns The same object while the text of the description does not change.
 */
export function useDiagramDescription(): DiagramDescription {
  const name = useDoc((state) => state.name)
  const nodes = useDeferredValue(useDoc((state) => state.nodes))
  const edges = useDoc((state) => state.edges)
  const flows = useDoc((state) => state.flows)
  const json = useMemo(
    () => JSON.stringify(describeDiagram({ name, nodes, edges, flows })),
    [name, nodes, edges, flows],
  )
  return useMemo((): DiagramDescription => JSON.parse(json), [json])
}
