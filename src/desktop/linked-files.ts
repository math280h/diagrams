import type { Diagram } from '@/model/schema'
import { serializeDiagram } from '@/persistence/cached-repository'
import { takeLinkedFiles } from '@/persistence/bootstrap'
import { migrate } from '@/persistence/migrations'
import { desktopApi } from './bridge'

function api() {
  const desktop = desktopApi()
  if (!desktop) throw new Error('Diagram files outside the diagrams folder need the desktop app.')
  return desktop
}

/**
 * Asks for diagram files anywhere, such as in a repository, and adds them to the diagram list. The app saves them where
 * they are.
 *
 * @returns The ids of the opened diagrams.
 */
export async function openDiagramFiles(): Promise<string[]> {
  const files = await api().request('files.open', null)
  takeLinkedFiles(files)
  return files.map((file) => file.id)
}

/**
 * Asks where to save the diagram as a file, writes it there and adds it to the diagram list.
 *
 * @returns The id of the new diagram, or `null` if the user cancelled.
 */
export async function saveDiagramAsFile(diagram: Diagram): Promise<string | null> {
  const file = await api().request('files.saveAs', { name: diagram.name, text: serializeDiagram(diagram) })
  if (!file) return null
  takeLinkedFiles([file])
  return file.id
}

export function showDiagramFile(id: string) {
  void api().request('files.show', { id })
}

/**
 * Returns a linked diagram as the last commit of its git repository holds it.
 *
 * @throws Error If git cannot read the file from the last commit, or the file there is not a diagram.
 */
export async function committedDiagram(id: string): Promise<Diagram> {
  const { text } = await api().request('files.committed', { id })
  return { ...migrate(JSON.parse(text)), id }
}
