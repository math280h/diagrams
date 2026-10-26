import type { FileChange, StoredFile } from '@/desktop/contract'
import type { Diagram } from '@/model/schema'
import { errorMessage } from '@/lib/error-message'
import { migrate } from './migrations'
import {
  diagramMeta,
  type DiagramMeta,
  type DiagramRepository,
  type RepositoryEvent,
  type StorageLocation,
} from './repository'

export interface RepositorySink {
  write(file: StoredFile): Promise<unknown>
  remove(id: string, trash: boolean): Promise<unknown>
}

export interface CachedRepository extends DiagramRepository {
  /** Takes a change that happened outside this window, for example a file that an editor or git changed. */
  applyExternal(change: FileChange): void
}

interface Entry {
  text: string
  meta: DiagramMeta
}

function metaFromText(id: string, text: string): DiagramMeta {
  try {
    const raw = JSON.parse(text) as Partial<Diagram>
    return {
      id,
      name: typeof raw.name === 'string' ? raw.name : id,
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
      nodeCount: Array.isArray(raw.nodes) ? raw.nodes.length : 0,
      flowCount: Array.isArray(raw.flows) ? raw.flows.length : 0,
    }
  } catch {
    return { id, name: id, updatedAt: 0, nodeCount: 0, flowCount: 0 }
  }
}

function entryFromText(id: string, text: string): Entry {
  return { text, meta: metaFromText(id, text) }
}

export function serializeDiagram(diagram: Diagram) {
  return `${JSON.stringify(diagram, null, 2)}\n`
}

/**
 * Creates a repository that keeps every diagram in memory and writes changes through to a sink.
 *
 * Reads are synchronous. The id of a diagram is its file name, so a copied file never saves under the id inside it.
 */
export function createCachedRepository(options: {
  location: StorageLocation
  files: StoredFile[]
  sink: RepositorySink
}): CachedRepository {
  const entries = new Map(options.files.map((file) => [file.id, entryFromText(file.id, file.text)]))
  const listeners = new Set<(event: RepositoryEvent) => void>()
  const pending = new Set<Promise<void>>()

  const emit = (event: RepositoryEvent) => {
    for (const listener of listeners) listener(event)
  }

  const track = (id: string, work: Promise<unknown>, kind: 'save' | 'remove') => {
    const tracked = work.then(
      () => emit({ kind: kind === 'save' ? 'saved' : 'removed', id }),
      (error: unknown) =>
        emit(
          kind === 'save'
            ? { kind: 'save-failed', id, reason: 'unknown', message: errorMessage(error) }
            : { kind: 'remove-failed', id, message: errorMessage(error) },
        ),
    )
    pending.add(tracked)
    void tracked.then(() => pending.delete(tracked))
  }

  return {
    location: options.location,

    list() {
      return [...entries.values()].map((entry) => entry.meta).toSorted((a, b) => b.updatedAt - a.updatedAt)
    },

    load(id) {
      const entry = entries.get(id)
      if (!entry) return null
      return { ...migrate(JSON.parse(entry.text)), id }
    },

    save(diagram) {
      const text = serializeDiagram(diagram)
      entries.set(diagram.id, { text, meta: diagramMeta(diagram) })
      track(diagram.id, options.sink.write({ id: diagram.id, text }), 'save')
      return { ok: true }
    },

    remove(id, { trash = true } = {}) {
      entries.delete(id)
      track(id, options.sink.remove(id, trash), 'remove')
    },

    usageBytes() {
      let total = 0
      for (const entry of entries.values()) total += entry.text.length
      return total
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    applyExternal(change) {
      const current = entries.get(change.id)
      if (change.kind === 'removed') {
        if (!current) return
        entries.delete(change.id)
        emit({ kind: 'changed', id: change.id })
        return
      }
      if (current?.text === change.text) return
      entries.set(change.id, entryFromText(change.id, change.text))
      emit({ kind: 'changed', id: change.id })
    },

    async settled() {
      await Promise.all(pending)
    },
  }
}
