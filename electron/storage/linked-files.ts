import { createHash, randomBytes } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import type { FileChange, LinkedFilesReset, StoredFile } from '@/desktop/contract'
import { DIAGRAM_FILE_SUFFIX, LINKED_ID_PREFIX } from '@/desktop/constants'
import { DIAGRAM_VERSION } from '@/model/schema'
import { migrate } from '@/persistence/migrations'
import { createFileQueue, errorCode } from './file-queue'
import { fileKeysOf, isSameFile, pathKey } from './same-file'

/** Returns the id of a linked file. The same file always gets the same id. */
export function linkedIdOf(file: string): string {
  return `${LINKED_ID_PREFIX}${createHash('sha256').update(pathKey(file)).digest('hex').slice(0, 12)}`
}

export function isLinkedId(id: string) {
  return id.startsWith(LINKED_ID_PREFIX)
}

/** Tells whether a text is a diagram in a format of this app or in a newer format. */
export function isDiagramText(text: string) {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return false
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false
  if ('version' in raw && typeof raw.version === 'number' && raw.version > DIAGRAM_VERSION) return true
  try {
    migrate(raw)
    return true
  } catch {
    return false
  }
}

function hasDiagramSuffix(file: string) {
  return path.basename(file).toLowerCase().endsWith(DIAGRAM_FILE_SUFFIX)
}

/**
 * Reads a file before the app links it. A file with a name that ends in `.diagram.json` can hold any text. Other files
 * must be diagrams.
 *
 * @returns The text of the file.
 * @throws Error If the file cannot be read, or if it is not a diagram.
 */
export async function readLinkableFile(file: string): Promise<string> {
  const name = path.basename(file)
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch {
    throw new Error(`${name} could not be read.`)
  }
  if (!hasDiagramSuffix(file) && !isDiagramText(text)) {
    throw new Error(`${name} is not a diagram. Open a diagram file that Diagrams saved or exported.`)
  }
  return text
}

export interface LinkedFilesOptions {
  /**
   * Tells for each file whether the diagrams folder lists it. The app does not link such a file: the library shows it
   * from the folder.
   */
  listedInFolder?: (files: readonly string[]) => Promise<boolean[]>
}

export type LinkedFiles = ReturnType<typeof createLinkedFiles>

function parseRegistry(text: string): { files: string[]; damaged: boolean } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { files: [], damaged: true }
  }
  const list: unknown = typeof data === 'object' && data !== null && 'files' in data ? data.files : undefined
  if (!Array.isArray(list)) return { files: [], damaged: true }
  const files = list.filter((file): file is string => typeof file === 'string' && path.isAbsolute(file))
  return { files, damaged: files.length !== list.length }
}

async function writeFlushed(file: string, text: string) {
  await mkdir(path.dirname(file), { recursive: true })
  const temp = `${file}.tmp-${randomBytes(4).toString('hex')}`
  try {
    const handle = await open(temp, 'w')
    try {
      await handle.writeFile(text, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temp, file)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

function damagedCopyOf(registryFile: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(path.dirname(registryFile), `${path.basename(registryFile, '.json')}-damaged-${stamp}.json`)
}

/**
 * Keeps diagram files that live outside the diagrams folder, for example in a repository, where they are.
 *
 * The list of files lives in `registryFile`. Removing a linked diagram only takes it off the list; the file stays.
 * A damaged list does not stop the app: the app moves it to a copy next to it and keeps the entries that it can read.
 * When the app reads the list, it takes off each entry that the diagrams folder lists and each second entry of one
 * file. The files stay.
 */
export function createLinkedFiles(registryFile: string, options: LinkedFilesOptions = {}) {
  const links = new Map<string, string>()
  let loaded: Promise<void> | null = null
  let saving: Promise<unknown> = Promise.resolve()
  let reset: LinkedFilesReset | null = null
  let damagedCopy: string | null = null

  const queue = createFileQueue({
    pathOf: (id) => {
      const file = links.get(id)
      if (!file) throw new Error(`No file is linked as "${id}".`)
      return file
    },
    accepts: (id) => links.has(id),
    prepare: async (file) => {
      await mkdir(path.dirname(file), { recursive: true })
    },
  })

  const persist = () => {
    const text = `${JSON.stringify({ files: [...links.values()] }, null, 2)}\n`
    saving = saving.catch(() => undefined).then(() => writeFlushed(registryFile, text))
    return saving
  }

  const keepDamagedCopy = async () => {
    const copy = damagedCopyOf(registryFile)
    try {
      await rename(registryFile, copy)
    } catch {
      return false
    }
    damagedCopy = copy
    return true
  }

  const listedInFolder = async (files: readonly string[]): Promise<boolean[]> => {
    try {
      return (await options.listedInFolder?.(files)) ?? []
    } catch {
      return []
    }
  }

  const dropDuplicates = async () => {
    const entries = [...links]
    const files = entries.map(([, file]) => file)
    const [keys, inFolder] = await Promise.all([fileKeysOf(files), listedInFolder(files)])
    const seen = new Set<string>()
    let dropped = false
    entries.forEach(([id], index) => {
      const key = keys[index]!
      if (inFolder[index] || seen.has(key)) {
        links.delete(id)
        dropped = true
      }
      seen.add(key)
    })
    return dropped
  }

  const sameFileId = async (file: string) => {
    const id = linkedIdOf(file)
    if (links.has(id)) return id
    const entries = [...links]
    const same = await Promise.all(entries.map(([, linkedFile]) => isSameFile(linkedFile, file)))
    return entries[same.indexOf(true)]?.[0] ?? id
  }

  const load = async () => {
    let text: string
    try {
      text = await readFile(registryFile, 'utf8')
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return
      loaded = null
      throw error
    }
    const { files, damaged } = parseRegistry(text)
    for (const file of files) links.set(linkedIdOf(file), path.resolve(file))
    const dropped = await dropDuplicates()
    if (damaged) reset = { copyKept: await keepDamagedCopy() }
    if (damaged || dropped) await persist().catch(() => undefined)
  }

  const ready = () => {
    loaded ??= load()
    return loaded
  }

  const readyOrEmpty = () => ready().catch(() => undefined)

  async function read(id: string): Promise<StoredFile | null> {
    const file = links.get(id)
    if (!file) return null
    try {
      const text = await readFile(file, 'utf8')
      await queue.remember(id, text)
      return { id, text, path: file }
    } catch {
      return null
    }
  }

  return {
    /** Returns every linked file that can be read. A list that cannot be read gives no files until a later call. */
    async readAll(): Promise<StoredFile[]> {
      await readyOrEmpty()
      await queue.drain()
      const files = await Promise.all([...links.keys()].map(read))
      return files.filter((file): file is StoredFile => file !== null)
    },

    /** Returns the reset of a damaged list once, and then `null`. */
    takeReset(): LinkedFilesReset | null {
      const taken = reset
      reset = null
      return taken
    },

    damagedCopy: () => damagedCopy,

    /**
     * Adds a file to the list and reads it. A file that is on the list already, also through another path, keeps its
     * entry.
     *
     * @throws Error If the file cannot be read, or if it is not a diagram as {@link readLinkableFile} tells.
     */
    async link(file: string): Promise<StoredFile> {
      await ready()
      await readLinkableFile(file)
      const id = await sameFileId(file)
      const previous = links.get(id)
      if (id === linkedIdOf(file)) links.set(id, path.resolve(file))
      const stored = await read(id)
      if (!stored) {
        if (previous === undefined) links.delete(id)
        else links.set(id, previous)
        throw new Error(`${path.basename(file)} could not be read.`)
      }
      await persist()
      return stored
    },

    /** Writes a new file, adds it to the list and returns it. A file that is on the list already keeps its entry. */
    async create(file: string, text: string): Promise<StoredFile> {
      await ready()
      const id = await sameFileId(file)
      if (id === linkedIdOf(file)) links.set(id, path.resolve(file))
      await queue.write(id, text)
      await persist()
      return { id, text, path: links.get(id)! }
    },

    /** Takes a file off the list. The file stays where it is. */
    async unlink(id: string) {
      await ready()
      if (!links.delete(id)) return
      queue.forget(id)
      await persist()
    },

    write: queue.write,

    pathOf: (id: string) => links.get(id) ?? null,

    /** Returns each linked file with its id. */
    entries: () => [...links].map(([id, file]) => ({ id, file })),

    inspect: queue.inspect,

    /** Checks every linked file again and returns every change since the last check. */
    async rescan(): Promise<FileChange[]> {
      await readyOrEmpty()
      const changes = await Promise.all([...links.keys()].map(queue.inspect))
      return changes
        .filter((change): change is FileChange => change !== null)
        .map((change) => (change.kind === 'changed' ? { ...change, path: links.get(change.id) } : change))
    },

    drain: queue.drain,
  }
}
