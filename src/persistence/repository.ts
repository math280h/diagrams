import { z } from 'zod'
import type { Diagram } from '@/model/schema'
import { errorMessage } from '@/lib/error-message'
import { migrate } from './migrations'

const diagramMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  updatedAt: z.number(),
  nodeCount: z.number(),
  flowCount: z.number(),
})

export type DiagramMeta = z.infer<typeof diagramMetaSchema>

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unknown'; message: string }
export type SaveFailure = Extract<SaveResult, { ok: false }>

export type StorageLocation = { kind: 'browser'; budgetBytes: number } | { kind: 'folder'; path: string }

/**
 * A change to stored diagrams.
 *
 * `changed` comes from outside this window, and a `null` id means that the list changed. The other kinds report the
 * end of a save or remove of this window: at once in the browser, after the write on the desktop.
 */
export type RepositoryEvent =
  | { kind: 'changed'; id: string | null }
  | { kind: 'saved'; id: string }
  | ({ kind: 'save-failed'; id: string } & Omit<SaveFailure, 'ok'>)
  | { kind: 'removed'; id: string }
  | { kind: 'remove-failed'; id: string; message: string }

export interface DiagramRepository {
  readonly location: StorageLocation
  list(): DiagramMeta[]
  load(id: string): Diagram | null
  save(diagram: Diagram): SaveResult
  remove(id: string): void
  /** Returns the size of all stored diagrams. */
  usageBytes(): number
  /**
   * Calls the listener for each {@link RepositoryEvent}.
   *
   * @returns A function that removes the listener.
   */
  subscribe(listener: (event: RepositoryEvent) => void): () => void
  /** Resolves when every save and remove that started before the call has reached storage. */
  settled(): Promise<void>
}

const PREFIX = 'dg:'
const INDEX_KEY = `${PREFIX}index`
const DIAGRAM_PREFIX = `${PREFIX}diagram:`
const diagramKey = (id: string) => `${DIAGRAM_PREFIX}${id}`
export const STORAGE_BUDGET_BYTES = 5 * 1024 * 1024

function readIndex(): DiagramMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry) => {
      const meta = diagramMetaSchema.safeParse(entry)
      return meta.success ? [meta.data] : []
    })
  } catch {
    return []
  }
}

function isQuotaError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22)
  )
}

export function diagramMeta(diagram: Pick<Diagram, 'id' | 'name' | 'updatedAt' | 'nodes' | 'flows'>): DiagramMeta {
  return {
    id: diagram.id,
    name: diagram.name,
    updatedAt: diagram.updatedAt,
    nodeCount: diagram.nodes.length,
    flowCount: diagram.flows.length,
  }
}

const localListeners = new Set<(event: RepositoryEvent) => void>()

function emitLocal(event: RepositoryEvent) {
  for (const listener of localListeners) listener(event)
}

function saveLocal(diagram: Diagram): SaveResult {
  try {
    localStorage.setItem(diagramKey(diagram.id), JSON.stringify(diagram))
    const index = readIndex().filter((entry) => entry.id !== diagram.id)
    index.push(diagramMeta(diagram))
    localStorage.setItem(INDEX_KEY, JSON.stringify(index))
    return { ok: true }
  } catch (error) {
    if (isQuotaError(error)) return { ok: false, reason: 'quota', message: 'The browser storage is full.' }
    return { ok: false, reason: 'unknown', message: errorMessage(error) }
  }
}

export const localRepository: DiagramRepository = {
  location: { kind: 'browser', budgetBytes: STORAGE_BUDGET_BYTES },

  list() {
    return readIndex().toSorted((a, b) => b.updatedAt - a.updatedAt)
  },

  load(id) {
    const raw = localStorage.getItem(diagramKey(id))
    if (!raw) return null
    return migrate(JSON.parse(raw))
  },

  save(diagram) {
    const result = saveLocal(diagram)
    if (result.ok) emitLocal({ kind: 'saved', id: diagram.id })
    else emitLocal({ kind: 'save-failed', id: diagram.id, reason: result.reason, message: result.message })
    return result
  },

  remove(id) {
    localStorage.removeItem(diagramKey(id))
    localStorage.setItem(INDEX_KEY, JSON.stringify(readIndex().filter((entry) => entry.id !== id)))
    emitLocal({ kind: 'removed', id })
  },

  usageBytes() {
    let total = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(PREFIX)) continue
      total += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2
    }
    return total
  },

  subscribe(listener) {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === INDEX_KEY) listener({ kind: 'changed', id: null })
      else if (event.key.startsWith(DIAGRAM_PREFIX)) {
        listener({ kind: 'changed', id: event.key.slice(DIAGRAM_PREFIX.length) })
      }
    }
    localListeners.add(listener)
    window.addEventListener('storage', onStorage)
    return () => {
      localListeners.delete(listener)
      window.removeEventListener('storage', onStorage)
    }
  },

  settled: () => Promise.resolve(),
}
