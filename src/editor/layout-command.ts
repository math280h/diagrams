import { toast } from 'sonner'
import type { LayoutDirection } from '@/layout/diagram-layout'
import { useDoc } from '@/store/doc-store'
import { applyLayoutResult } from '@/store/actions'
import { openDiagramId } from '@/store/document'
import { errorMessage } from '@/lib/error-message'

/**
 * Lays out the open diagram in a worker, then applies the result to the diagram as it is then.
 *
 * Changes that the user makes while the layout runs stay. If the editor opens another diagram before the layout ends,
 * the function ignores the result.
 */
export async function tidyUp(direction: LayoutDirection, fitView?: () => void) {
  const { id, nodes, edges } = useDoc.getState()
  if (nodes.length === 0) return
  try {
    const { layoutDiagram } = await import('@/layout/diagram-layout')
    const laidOut = await layoutDiagram(nodes, edges, direction)
    if (openDiagramId() !== id) return
    applyLayoutResult(laidOut)
    window.setTimeout(() => fitView?.(), 30)
  } catch (error) {
    toast.error('Tidy up failed.', { description: errorMessage(error) })
  }
}
