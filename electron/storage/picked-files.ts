import path from 'node:path'
import type { StoredFile } from '@/desktop/contract'
import type { DiagramFiles } from './diagram-files'
import { readLinkableFile, type LinkedFiles } from './linked-files'

/**
 * Opens and saves the files that the user picks in a file dialog. A file that the diagrams folder lists keeps its
 * folder id. The app links only the other files.
 */
export function createPickedFiles(files: DiagramFiles, linked: LinkedFiles) {
  const readFolderFile = async (id: string, file: string) => {
    const stored = await files.read(id)
    if (!stored) throw new Error(`${path.basename(file)} could not be read.`)
    return stored
  }

  return {
    /**
     * Returns the picked files and links each file outside the diagrams folder.
     *
     * @throws Error If a file cannot be read, or if a file outside the folder is not a diagram. The app then links none
     *   of the files.
     */
    async open(picked: readonly string[]): Promise<StoredFile[]> {
      const ids = await files.idsOf(picked)
      const targets = picked.map((file, index) => ({ file, id: ids[index] ?? null }))
      await Promise.all(targets.filter(({ id }) => id === null).map(({ file }) => readLinkableFile(file)))
      return Promise.all(targets.map(({ file, id }) => (id === null ? linked.link(file) : readFolderFile(id, file))))
    },

    /**
     * Writes a diagram to a picked file. A file that the diagrams folder lists after the write becomes a folder file.
     * Any other file becomes a linked file.
     */
    async saveAs(file: string, text: string): Promise<StoredFile> {
      const id = await files.idOf(file)
      if (id === null) return linked.create(file, text)
      await files.write(id, text, { replace: true })
      return { id, text }
    },
  }
}
