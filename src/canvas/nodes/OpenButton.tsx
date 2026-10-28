import { ZoomIn } from 'lucide-react'
import { useCanvasMode } from '@/canvas/mode'
import { useLibrary } from '@/store/library-store'

/** Opens the diagram that a node leads to. It shows only where the canvas can open diagrams and the diagram exists. */
export function OpenButton({ diagramId, nodeId }: { diagramId: string | undefined; nodeId: string }) {
  const { openDiagram } = useCanvasMode()
  const name = useLibrary((state) => state.items.find((item) => item.id === diagramId)?.name)
  if (!openDiagram || !diagramId || name === undefined) return null
  return (
    <button
      type="button"
      className="dg-open nodrag nopan"
      aria-label={`Open ${name}`}
      title={`Open ${name}`}
      onClick={(event) => {
        event.stopPropagation()
        openDiagram(diagramId, nodeId)
      }}
    >
      <ZoomIn aria-hidden />
    </button>
  )
}
