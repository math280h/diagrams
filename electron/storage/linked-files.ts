import { createHash, randomBytes } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import type { FileChange, LinkedFilesReset, StoredFile } from '@/desktop/contract'
import { LINKED_ID_PREFIX } from '@/desktop/constants'
import { createFileQueue, errorCode } from './file-queue'

/** Returns the id of a linked file. The same file always gets the same id. */
export function linkedIdOf(file: string): string {
  const resolved = path.resolve(file)
  const key = process.platform === 'win32' || process.platform === 'darwin' ? resolved.toLowerCase() : resolved
  return `${LINKED_ID_PREFIX}${createHash('sha256').update(key).digest('hex').slice(0, 12)}`
}

export function isLinkedId(id: string) {
  return id.startsWith(LINKED_ID_PREFIX)
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
 */
export function createLinkedFiles(registryFile: string) {
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
    if (!damaged) return
    reset = { copyKept: await keepDamagedCopy() }
    await persist().catch(() => undefined)
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
     * Adds a file to the list and reads it.
     *
     * @throws Error If the file cannot be read.
     */
    async link(file: string): Promise<StoredFile> {
      await ready()
      const id = linkedIdOf(file)
      links.set(id, path.resolve(file))
      const stored = await read(id)
      if (!stored) {
        links.delete(id)
        throw new Error(`${path.basename(file)} could not be read.`)
      }
      await persist()
      return stored
    },

    /** Writes a new file, adds it to the list and returns it. */
    async create(file: string, text: string): Promise<StoredFile> {
      await ready()
      const id = linkedIdOf(file)
      links.set(id, path.resolve(file))
      await queue.write(id, text)
      await persist()
      return { id, text, path: path.resolve(file) }
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
