import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { FileChange, StoredFile } from '@/desktop/contract'
import { LINKED_ID_PREFIX } from '@/desktop/constants'
import { createFileQueue } from './file-queue'

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

/**
 * Keeps diagram files that live outside the diagrams folder, for example in a repository, where they are.
 *
 * The list of files lives in `registryFile`. Removing a linked diagram only takes it off the list; the file stays.
 */
export function createLinkedFiles(registryFile: string) {
  const links = new Map<string, string>()
  let loaded: Promise<void> | null = null
  let saving: Promise<unknown> = Promise.resolve()

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

  const ready = () => {
    loaded ??= readFile(registryFile, 'utf8').then(
      (text) => {
        const data = JSON.parse(text) as { files?: unknown }
        for (const file of Array.isArray(data.files) ? data.files : []) {
          if (typeof file === 'string') links.set(linkedIdOf(file), path.resolve(file))
        }
      },
      () => undefined,
    )
    return loaded
  }

  const persist = () => {
    const text = `${JSON.stringify({ files: [...links.values()] }, null, 2)}\n`
    saving = saving
      .catch(() => undefined)
      .then(async () => {
        await mkdir(path.dirname(registryFile), { recursive: true })
        const temp = `${registryFile}.tmp-${randomBytes(4).toString('hex')}`
        await writeFile(temp, text, 'utf8')
        await rename(temp, registryFile)
      })
    return saving
  }

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
    async readAll(): Promise<StoredFile[]> {
      await ready()
      await queue.drain()
      const files = await Promise.all([...links.keys()].map(read))
      return files.filter((file): file is StoredFile => file !== null)
    },

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
      await ready()
      const changes = await Promise.all([...links.keys()].map(queue.inspect))
      return changes
        .filter((change): change is FileChange => change !== null)
        .map((change) => (change.kind === 'changed' ? { ...change, path: links.get(change.id) } : change))
    },

    drain: queue.drain,
  }
}
