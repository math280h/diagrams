import type { FileChange, FileWriteOutcome, StoredFile } from '@/desktop/contract'
import type { Diagram } from '@/model/schema'
import { errorMessage } from '@/lib/error-message'
import { migrate } from './migrations'
import { withSchemaAddress } from './schema-address'
import {
  diagramMeta,
  type DiagramMeta,
  type DiagramRepository,
  type RepositoryEvent,
  type StorageLocation,
  TrashError,
} from './repository'

export interface RepositorySink {
  /** Resolves with `kept-outside` when storage keeps a change from outside and does not take the file. */
  write(file: StoredFile): Promise<FileWriteOutcome | void>
  /** Rejects with a {@link TrashError} if the trash fails and the file stays. */
  remove(id: string, trash: boolean): Promise<unknown>
}

export interface CachedRepository extends DiagramRepository {
  /** Takes a change that happened outside this window, for example a file that an editor or git changed. */
  applyExternal(change: FileChange): void
  discardUnstored(id: string): void
}

interface Entry {
  text: string
  meta: DiagramMeta
}

function metaFromText(id: string, text: string, path: string | undefined): DiagramMeta {
  const where = path ? { path } : {}
  try {
    const raw = JSON.parse(text) as Partial<Diagram>
    return {
      id,
      name: typeof raw.name === 'string' ? raw.name : id,
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
      nodeCount: Array.isArray(raw.nodes) ? raw.nodes.length : 0,
      flowCount: Array.isArray(raw.flows) ? raw.flows.length : 0,
      ...where,
    }
  } catch {
    return { id, name: id, updatedAt: 0, nodeCount: 0, flowCount: 0, ...where }
  }
}

function entryFromText(id: string, text: string, path: string | undefined): Entry {
  return { text, meta: metaFromText(id, text, path) }
}

const DECIMALS = 100

/**
 * Returns the text of a diagram file: indented JSON with numbers to two decimals, so that a change shows as a few lines
 * in a diff. It starts with the `$schema` of the diagram, or with the schema address of the current format.
 */
export function serializeDiagram(diagram: Diagram) {
  const rounded = JSON.stringify(
    withSchemaAddress(diagram),
    (_key, value: unknown) =>
      typeof value === 'number' && !Number.isInteger(value) ? Math.round(value * DECIMALS) / DECIMALS : value,
    2,
  )
  return `${rounded}\n`
}

function withSortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withSortedKeys)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .toSorted()
      .map((key) => [key, withSortedKeys((value as Record<string, unknown>)[key])]),
  )
}

/**
 * Returns the content of a diagram file without `$schema`, the format, the view of a format before 22 and the fields
 * that change on a measure or any save. The keys are in a fixed order: a diagram that the app parses again has its
 * keys in the order of the schema.
 */
function lastingContent(text: string): string {
  const {
    $schema: _schema,
    version: _version,
    viewport: _viewport,
    rev: _rev,
    updatedAt: _updatedAt,
    nodes,
    ...rest
  } = JSON.parse(text) as Diagram & { viewport?: unknown }
  return JSON.stringify(withSortedKeys({ ...rest, nodes: nodes.map(({ measured: _measured, ...node }) => node) }))
}

/**
 * Creates a repository that keeps every diagram in memory and writes changes through to a sink.
 *
 * Reads are synchronous. The id of a diagram is its file name, so a copied file never saves under the id inside it.
 * Only the last save of a diagram sends `saved` or `save-failed`. A save that the sink refuses for a change from outside
 * sends neither, and the repository takes that change as {@link CachedRepository.applyExternal} does. A linked file and a file in a picked folder are
 * project files: a save that changes only the save counter, the time, measured sizes, `$schema` or the format does not
 * write them, when storage has the other content already.
 */
export function createCachedRepository(options: {
  location: StorageLocation
  files: StoredFile[]
  sink: RepositorySink
}): CachedRepository {
  const entries = new Map(options.files.map((file) => [file.id, entryFromText(file.id, file.text, file.path)]))
  const stored = new Map(options.files.map((file) => [file.id, file.text]))
  const latestSave = new Map<string, number>()
  const listeners = new Set<(event: RepositoryEvent) => void>()
  const pending = new Set<Promise<void>>()

  const emit = (event: RepositoryEvent) => {
    for (const listener of listeners) listener(event)
  }

  const settle = (work: Promise<void>) => {
    pending.add(work)
    void work.then(() => pending.delete(work))
  }

  const applyExternal = (change: FileChange) => {
    const current = entries.get(change.id)
    if (change.kind === 'removed') {
      stored.delete(change.id)
      if (!current) return
      entries.delete(change.id)
      emit({ kind: 'changed', id: change.id })
      return
    }
    stored.set(change.id, change.text)
    if (current?.text === change.text) return
    entries.set(change.id, entryFromText(change.id, change.text, change.path ?? current?.meta.path))
    emit({ kind: 'changed', id: change.id })
  }

  const trackSave = (id: string, text: string, work: Promise<FileWriteOutcome | void>) => {
    const seq = (latestSave.get(id) ?? 0) + 1
    latestSave.set(id, seq)
    const isLatest = () => latestSave.get(id) === seq
    settle(
      work.then(
        (outcome) => {
          if (outcome?.kind === 'kept-outside') return applyExternal(outcome.change)
          if (!isLatest()) return
          stored.set(id, text)
          emit({ kind: 'saved', id })
        },
        (error: unknown) => {
          if (isLatest()) emit({ kind: 'save-failed', id, reason: 'unknown', message: errorMessage(error) })
        },
      ),
    )
  }

  const trackRemove = (id: string, work: Promise<unknown>, removed: Entry | undefined) => {
    settle(
      work.then(
        () => {
          stored.delete(id)
          emit({ kind: 'removed', id })
        },
        (error: unknown) => {
          if (removed && !entries.has(id)) entries.set(id, removed)
          emit({
            kind: 'remove-failed',
            id,
            reason: error instanceof TrashError ? 'trash' : 'unknown',
            message: errorMessage(error),
          })
        },
      ),
    )
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

    storedText: (id) => entries.get(id)?.text ?? null,

    save(diagram) {
      const text = serializeDiagram(diagram)
      const current = entries.get(diagram.id)
      const path = current?.meta.path
      entries.set(diagram.id, { text, meta: { ...diagramMeta(diagram), ...(path ? { path } : {}) } })
      const projectFile = path !== undefined || options.location.kind === 'picked-folder'
      const storedText = stored.get(diagram.id)
      const unchanged = projectFile && storedText !== undefined && lastingContent(storedText) === lastingContent(text)
      trackSave(diagram.id, text, unchanged ? Promise.resolve() : options.sink.write({ id: diagram.id, text }))
      return { ok: true }
    },

    remove(id, { trash = true } = {}) {
      const removed = entries.get(id)
      entries.delete(id)
      trackRemove(id, options.sink.remove(id, trash), removed)
    },

    discardUnstored(id) {
      const text = stored.get(id)
      const entry = entries.get(id)
      if (entry?.text === text) return
      latestSave.set(id, (latestSave.get(id) ?? 0) + 1)
      if (text === undefined) entries.delete(id)
      else entries.set(id, entryFromText(id, text, entry?.meta.path))
      emit({ kind: 'changed', id })
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

    applyExternal,

    async settled() {
      await Promise.all(pending)
    },
  }
}
