import { openDiagramFiles } from '@/desktop/linked-files'
import { createBlankDiagram } from '@/persistence/library-actions'
import { reportError } from '@/store/problem-store'

type OpenDiagram = (diagramId: string) => void

export function createAndOpenBlankDiagram(open: OpenDiagram) {
  const { diagram, result } = createBlankDiagram()
  if (result.ok) open(diagram.id)
}

/** Asks for diagram files and adds them to the diagram list. When the user picks one file, its diagram opens. */
export function openPickedDiagramFiles(open: OpenDiagram) {
  void openDiagramFiles().then(
    (ids) => {
      if (ids.length === 1) open(ids[0]!)
    },
    (error: unknown) => reportError('The file could not be opened.', error),
  )
}
