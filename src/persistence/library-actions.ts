import { DIAGRAM_FILE_SUFFIX } from '@/desktop/constants'
import { forgetOpenedInApp } from '@/desktop/open-in-app'
import { createDiagram, DEFAULT_DIAGRAM_NAME, newId } from '@/model/defaults'
import type { Diagram } from '@/model/schema'
import { templateDiagrams, type Template } from '@/templates'
import { downloadBlob } from '@/lib/download'
import { safeFileName } from '@/lib/format'
import { closeDiagramSession, openDiagramId } from '@/store/document'
import { reportError } from '@/store/problem-store'
import { forgetVersions } from '@/store/versions'
import { loadDiagramOrNull, repository } from './active-repository'
import { DiagramFormatError, migrate } from './migrations'
import type { DiagramMeta, RemoveOptions, RemoveResult, SaveResult } from './repository'

export function withFreshIdentity(diagram: Diagram, name = diagram.name): Diagram {
  const now = Date.now()
  return { ...diagram, id: newId('d'), name, rev: 0, createdAt: now, updatedAt: now }
}

/**
 * Copies a template and the diagrams that it opens with new ids, and points the `opens` fields at the copies.
 *
 * @returns The copy of the template first.
 */
export function templateCopies(template: Template, name?: string): Diagram[] {
  const diagrams = templateDiagrams(template)
  const copies = diagrams.map((diagram, index) => withFreshIdentity(diagram, index === 0 ? name : undefined))
  const newIds = new Map(diagrams.map((diagram, index) => [diagram.id, copies[index]!.id]))
  for (const node of copies.flatMap((copy) => copy.nodes)) {
    if ((node.type === 'card' || node.type === 'group') && node.data.opens !== undefined) {
      node.data.opens = newIds.get(node.data.opens) ?? node.data.opens
    }
  }
  return copies
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
    if (diagram && isUnused(diagram)) void deleteDiagram(id, { trash: false })
  }
}

export function saveImported(diagram: Diagram): SaveResult {
  return repository().save(diagram)
}

/** Saves a copy of a stored diagram. An error toast shows when the stored data cannot be read. */
export function duplicateDiagram(id: string): Diagram | null {
  let source: Diagram | null
  try {
    source = repository().load(id)
  } catch (error) {
    reportError('Could not duplicate the diagram.', error, {
      description: 'Export the diagram file to keep its data.',
      facts: [`Storage: ${repository().location.kind}`],
    })
    return null
  }
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

/**
 * Deletes a diagram and waits until storage takes the delete. The version history goes only after that.
 *
 * @returns The failure if storage keeps the diagram. Then the diagram and its versions stay.
 */
export async function deleteDiagram(id: string, options?: RemoveOptions): Promise<RemoveResult> {
  closeDiagramSession(id, false)
  const result = await removeFromRepository(id, options)
  if (result.ok) {
    forgetOpenedInApp(id)
    forgetVersions(id)
  }
  return result
}

function removeFromRepository(id: string, options: RemoveOptions | undefined): Promise<RemoveResult> {
  return new Promise((resolve) => {
    const stop = repository().subscribe((event) => {
      if (event.id !== id || (event.kind !== 'removed' && event.kind !== 'remove-failed')) return
      stop()
      resolve(event.kind === 'removed' ? { ok: true } : { ok: false, reason: event.reason, message: event.message })
    })
    try {
      repository().remove(id, options)
    } catch (error) {
      stop()
      throw error
    }
  })
}

/** Returns the text of an exported diagram file. */
export function diagramFileText(diagram: Diagram): string {
  return JSON.stringify(diagram, null, 2)
}

export function exportDiagramJson(diagram: Diagram) {
  const blob = new Blob([diagramFileText(diagram)], { type: 'application/json' })
  downloadBlob(blob, `${safeFileName(diagram.name)}${DIAGRAM_FILE_SUFFIX}`)
}

/** Downloads the stored text of a diagram as it is, for a diagram that the app cannot read. */
export function exportStoredDiagram(meta: Pick<DiagramMeta, 'id' | 'name'>) {
  const text = repository().storedText(meta.id)
  if (text === null) {
    reportError('Could not export the diagram.', 'The diagram is not in storage.')
    return
  }
  downloadBlob(new Blob([text], { type: 'application/json' }), `${safeFileName(meta.name)}${DIAGRAM_FILE_SUFFIX}`)
}

const NOT_A_DIAGRAM = 'This file is not a diagram. Open a diagram file that Diagrams exported.'

/**
 * Reads a diagram from JSON text and keeps its id.
 *
 * @throws DiagramFormatError If the text is not a valid diagram.
 */
export function readDiagramJson(text: string): Diagram {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new DiagramFormatError(NOT_A_DIAGRAM)
  }
  if (typeof raw !== 'object' || raw === null) throw new DiagramFormatError(NOT_A_DIAGRAM)
  return migrate(raw)
}

/**
 * Reads a diagram from JSON text and gives it a new id.
 *
 * @throws DiagramFormatError If the text is not a valid diagram.
 */
export function parseDiagramJson(text: string): Diagram {
  return withFreshIdentity(readDiagramJson(text))
}
