import { DIAGRAM_FILE_SUFFIX } from '@/desktop/constants'
import { downloadBlob } from '@/lib/download'
import { safeFileName } from '@/lib/format'
import { zipEntries, type ZipEntry } from '@/lib/zip'
import { loadDiagramOrNull, repository } from './active-repository'
import { diagramFileText } from './library-actions'

function uniqueName(base: string, used: Set<string>): string {
  let name = `${base}${DIAGRAM_FILE_SUFFIX}`
  for (let count = 2; used.has(name); count++) name = `${base}-${count}${DIAGRAM_FILE_SUFFIX}`
  used.add(name)
  return name
}

/**
 * Returns a diagram file for each stored diagram, named after the diagram. A diagram that the app cannot read keeps
 * its stored text.
 */
export function backupEntries(): ZipEntry[] {
  const encoder = new TextEncoder()
  const used = new Set<string>()
  return repository()
    .list()
    .flatMap((meta) => {
      const diagram = loadDiagramOrNull(meta.id)
      const text = diagram ? diagramFileText(diagram) : repository().storedText(meta.id)
      if (text === null) return []
      return [{ name: uniqueName(safeFileName(meta.name), used), data: encoder.encode(text) }]
    })
}

/** Returns the name of a backup file, with the local date, for example `diagrams-backup-2026-11-21.zip`. */
export function backupFileName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `diagrams-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.zip`
}

/**
 * Downloads one zip file with a diagram file for each stored diagram.
 *
 * @returns The number of diagrams in the backup.
 */
export async function downloadBackup(now = new Date()): Promise<number> {
  const entries = backupEntries()
  downloadBlob(await zipEntries(entries, now), backupFileName(now))
  return entries.length
}
