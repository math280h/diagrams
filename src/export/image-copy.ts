import { toast } from 'sonner'
import { errorMessage } from '@/lib/error-message'
import type { Diagram, StoredEdge } from '@/model/schema'
import { toStoredEdge, toStoredNode } from '@/persistence/serialize'
import { detachedSelection } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { currentDiagram } from '@/store/document'
import { useSettings } from '@/store/settings-store'
import { pngWithDiagram } from './embed'

const COPY_MAX_SIZE_PX = 4096

/**
 * Writes an image to the clipboard. An SVG goes as text, and also as an image where the browser takes one.
 *
 * @param image - The image. A promise keeps the user activation of the click while the image renders.
 */
export function writeImageToClipboard(format: 'png' | 'svg', image: Promise<Blob>): Promise<void> {
  if (format === 'png') {
    const png = image.then((blob) => new Blob([blob], { type: 'image/png' }))
    return navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
  }
  const items: Record<string, Promise<Blob>> = {
    'text/plain': image.then(async (blob) => new Blob([await blob.text()], { type: 'text/plain' })),
  }
  if (typeof ClipboardItem.supports === 'function' && ClipboardItem.supports('image/svg+xml')) {
    items['image/svg+xml'] = image.then((blob) => new Blob([blob], { type: 'image/svg+xml' }))
  }
  return navigator.clipboard.write([new ClipboardItem(items)])
}

/** Returns the diagram that an exported image holds: all of it, or the selection without the flows. */
export function diagramToEmbed(selectionOnly: boolean): Diagram {
  const diagram = currentDiagram()
  if (!selectionOnly) return diagram
  const { nodes, edges } = detachedSelection()
  return {
    ...diagram,
    nodes: nodes.map(toStoredNode),
    edges: edges.map(toStoredEdge).filter((edge): edge is StoredEdge => edge !== null),
    flows: [],
  }
}

/** Copies the selection, or the whole diagram when nothing is selected, as a PNG image. */
export function copyDiagramAsPng() {
  const state = useDoc.getState()
  const selectionOnly = state.nodes.some((node) => node.selected)
  const part = selectionOnly ? detachedSelection() : state
  const image = (async () => {
    const { renderDiagramImage } = await import('./render-image')
    const { blob } = await renderDiagramImage(
      {
        ...state,
        id: state.id ?? 'diagram',
        nodes: part.nodes,
        edges: part.edges,
        flows: selectionOnly ? [] : state.flows,
      },
      { format: 'png', maxSizePx: COPY_MAX_SIZE_PX },
    )
    return useSettings.getState().embedDiagram ? pngWithDiagram(blob, diagramToEmbed(selectionOnly)) : blob
  })()
  void writeImageToClipboard('png', image).then(
    () => toast.success(selectionOnly ? 'Copied the selection as a PNG' : 'Copied the diagram as a PNG'),
    (error: unknown) => toast.error('The image could not be copied.', { description: errorMessage(error) }),
  )
}
