import { DIAGRAM_FILE_SUFFIX } from '@/desktop/constants'
import { forgetOpenedInApp } from '@/desktop/open-in-app'
import { createDiagram, DEFAULT_DIAGRAM_NAME, newId } from '@/model/defaults'
import type { Diagram } from '@/model/schema'
import { downloadBlob } from '@/lib/download'
import { safeFileName } from '@/lib/format'
import { closeDiagramSession, openDiagramId } from '@/store/document'
import { forgetVersions } from '@/store/versions'
import { loadDiagramOrNull, repository } from './active-repository'
import { DiagramFormatError, migrate } from './migrations'
import type { RemoveOptions, SaveResult } from './repository'

export function withFreshIdentity(diagram: Diagram, name = diagram.name): Diagram {
  const now = Date.now()
  return { ...diagram, id: newId('d'), name, rev: 0, createdAt: now, updatedAt: now }
}

const newBlankIds = new Set<string>()

export function createBlankDiagram(): { diagram: Diagram; result: SaveResult } {
  const diagram = createDiagram()
  const result = repository().save(diagram)
  if (result.ok) newBlankIds.add(diagram.id)
  return { diagram, result }
}

function isUnused(diagram: Diagram) {
  return (
    diagram.name === DEFAULT_DIAGRAM_NAME &&
    diagram.nodes.length === 0 &&
    diagram.edges.length === 0 &&
    diagram.flows.length === 0
  )
}

/**
 * Deletes each diagram from {@link createBlankDiagram} that is still empty and has the default name, if no editor
 * shows it. On the desktop, the file does not go to the trash.
 */
export function discardUnusedBlankDiagrams() {
  for (const id of newBlankIds) {
    if (openDiagramId() === id) continue
    newBlankIds.delete(id)
    const diagram = loadDiagramOrNull(id)
    if (diagram && isUnused(diagram)) deleteDiagram(id, { trash: false })
  }
}

export function saveImported(diagram: Diagram): SaveResult {
  return repository().save(diagram)
}

export function duplicateDiagram(id: string): Diagram | null {
  const source = repository().load(id)
  if (!source) return null
  const copy = withFreshIdentity(source, `${source.name} copy`)
  repository().save(copy)
  return copy
}

export function renameDiagram(id: string, name: string) {
  const diagram = repository().load(id)
  if (!diagram) return
  repository().save({ ...diagram, name, rev: diagram.rev + 1, updatedAt: Date.now() })
}

export function deleteDiagram(id: string, options?: RemoveOptions) {
  closeDiagramSession(id, false)
  repository().remove(id, options)
  forgetOpenedInApp(id)
  forgetVersions(id)
}

export function exportDiagramJson(diagram: Diagram) {
  const blob = new Blob([JSON.stringify(diagram, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `${safeFileName(diagram.name)}${DIAGRAM_FILE_SUFFIX}`)
}

const NOT_A_DIAGRAM = 'This file is not a diagram. Open a diagram file that Diagrams exported.'

/**
 * Reads a diagram from JSON text and gives it a new id.
 *
 * @throws DiagramFormatError If the text is not a valid diagram.
 */
export function parseDiagramJson(text: string): Diagram {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new DiagramFormatError(NOT_A_DIAGRAM)
  }
  if (typeof raw !== 'object' || raw === null) throw new DiagramFormatError(NOT_A_DIAGRAM)
  return withFreshIdentity(migrate(raw))
}
