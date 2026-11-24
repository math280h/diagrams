import { embeddedDiagramText } from '@/export/embed'
import { errorMessage } from '@/lib/error-message'
import { isZip, unzipEntries } from '@/lib/zip'
import type { Diagram } from '@/model/schema'
import { loadDiagramOrNull, repository } from './active-repository'
import { isSafeId } from './diagram-file-name'
import { readDiagramJson, withFreshIdentity } from './library-actions'

export interface ImportedDiagram {
  id: string
  name: string
}

export interface ImportFailure {
  /** The file name. For a file in a zip file: the zip name, `/`, and the path in the zip. */
  file: string
  reason: string
}

export interface ImportReport {
  imported: ImportedDiagram[]
  /** The imported diagrams that got a new id, because a different stored diagram has their id. */
  copies: ImportedDiagram[]
  /** The diagrams of the files that are already stored with the same id and content. */
  unchanged: ImportedDiagram[]
  failed: ImportFailure[]
}

interface Source {
  file: string
  blob: Blob
}

interface Parsed {
  file: string
  diagram: Diagram
}

const NO_DIAGRAM_IN_IMAGE =
  'This image holds no diagram. Export it again with "Keep the diagram in the file" on, or open the JSON file.'
const NO_DIAGRAM_IN_ZIP = 'This zip file holds no diagram files.'
const DIAGRAM_ENTRY = /\.(json|png|svg)$/i
const IMAGE_FILE = /\.(png|svg)$/i

function isHidden(path: string): boolean {
  return path.split('/').some((part) => part.startsWith('.') || part === '__MACOSX')
}

async function isZipFile(file: File): Promise<boolean> {
  if (/\.zip$/i.test(file.name) || file.type === 'application/zip') return true
  return isZip(new Uint8Array(await file.slice(0, 4).arrayBuffer()))
}

async function sourcesOf(file: File, failed: ImportFailure[]): Promise<Source[]> {
  if (!(await isZipFile(file))) return [{ file: file.name, blob: file }]
  try {
    const entries = (await unzipEntries(new Uint8Array(await file.arrayBuffer()))).filter(
      (entry) => DIAGRAM_ENTRY.test(entry.name) && !isHidden(entry.name),
    )
    if (entries.length === 0) failed.push({ file: file.name, reason: NO_DIAGRAM_IN_ZIP })
    return entries.map((entry) => ({ file: `${file.name}/${entry.name}`, blob: new Blob([entry.data as BlobPart]) }))
  } catch (error) {
    failed.push({ file: file.name, reason: errorMessage(error) })
    return []
  }
}

async function diagramText(source: Source): Promise<string> {
  if (IMAGE_FILE.test(source.file) || source.blob.type.startsWith('image/')) {
    const text = await embeddedDiagramText(source.blob)
    if (text === null) throw new Error(NO_DIAGRAM_IN_IMAGE)
    return text
  }
  return source.blob.text()
}

/**
 * Reads the diagrams of diagram files, images that hold a diagram, and zip files of them, such as a backup. Each
 * diagram goes through the migrations and the schema.
 */
export async function readDiagramFiles(files: readonly File[]): Promise<{ parsed: Parsed[]; failed: ImportFailure[] }> {
  const parsed: Parsed[] = []
  const failed: ImportFailure[] = []
  for (const file of files) {
    for (const source of await sourcesOf(file, failed)) {
      try {
        parsed.push({ file: source.file, diagram: readDiagramJson(await diagramText(source)) })
      } catch (error) {
        failed.push({ file: source.file, reason: errorMessage(error) })
      }
    }
  }
  return { parsed, failed }
}

const sameContent = (a: Diagram | null, b: Diagram) => a !== null && JSON.stringify(a) === JSON.stringify(b)

/**
 * Saves read diagrams and never replaces a stored diagram:
 *
 * - A diagram keeps its id if no stored diagram has it.
 * - A diagram with the id and the content of a stored diagram is not saved again.
 * - Any other diagram gets a new id. The `opens` fields of the other imported diagrams then point to the copy.
 */
export function saveReadDiagrams(parsed: readonly Parsed[]): ImportReport {
  const report: ImportReport = { imported: [], copies: [], unchanged: [], failed: [] }
  const stored = new Set(
    repository()
      .list()
      .map((meta) => meta.id),
  )
  const placed = new Map<string, Diagram>()
  const newIds = new Map<string, string>()
  const toSave: Parsed[] = []

  for (const { file, diagram } of parsed) {
    const { id } = diagram
    const storedHere = stored.has(id) || repository().storedText(id) !== null
    const occupant = placed.get(id) ?? (storedHere ? loadDiagramOrNull(id) : null)
    if (sameContent(occupant, diagram)) {
      report.unchanged.push({ id, name: diagram.name })
      continue
    }
    if (!storedHere && !placed.has(id) && isSafeId(id)) {
      placed.set(id, diagram)
      toSave.push({ file, diagram })
      continue
    }
    const copy = withFreshIdentity(diagram)
    if (storedHere && !newIds.has(id)) newIds.set(id, copy.id)
    placed.set(copy.id, copy)
    toSave.push({ file, diagram: copy })
    report.copies.push({ id: copy.id, name: copy.name })
  }

  for (const { file, diagram } of toSave) {
    for (const node of diagram.nodes) {
      if ((node.type === 'card' || node.type === 'group') && node.data.opens !== undefined) {
        node.data.opens = newIds.get(node.data.opens) ?? node.data.opens
      }
    }
    const result = repository().save(diagram)
    if (result.ok) report.imported.push({ id: diagram.id, name: diagram.name })
    else {
      report.failed.push({ file, reason: result.message })
      report.copies = report.copies.filter((copy) => copy.id !== diagram.id)
    }
  }
  return report
}

/** Reads and saves the diagrams of the files with the rules of {@link saveReadDiagrams}. */
export async function importDiagramFiles(files: readonly File[]): Promise<ImportReport> {
  const { parsed, failed } = await readDiagramFiles(files)
  const report = saveReadDiagrams(parsed)
  return { ...report, failed: [...failed, ...report.failed] }
}
