import type { Diagram } from '@/model/schema'
import { migrate } from './migrations'

/**
 * Who made the changes in a version.
 *
 * `opened` is the state of a diagram when the history first saw it. `outside` is a state that another tab, another
 * program or a file sync wrote.
 */
export type VersionAuthor = 'you' | 'agent' | 'restore' | 'opened' | 'outside'

export interface VersionMeta {
  id: string
  diagramId: string
  /** The time of the first change in this version, in milliseconds since the epoch. */
  startedAt: number
  /** The time of the last change in this version, in milliseconds since the epoch. */
  at: number
  author: VersionAuthor
  /** The title of the agent tool that made an agent version. */
  tool?: string
  /** The time of the version that a restore brought back, in milliseconds since the epoch. */
  restoredAt?: number
  summary: string
}

/** The versions of each diagram, in storage that the storage budget of the diagrams does not cover. */
export interface VersionStore {
  /** Returns the versions of a diagram, newest first. */
  list(diagramId: string): Promise<VersionMeta[]>
  /** Returns the diagram of a version, or `null` if the version does not exist. */
  load(id: string): Promise<Diagram | null>
  /** Adds a version, or replaces the version with the same id, and removes the versions with the `remove` ids. */
  put(meta: VersionMeta, diagram: Diagram, remove: readonly string[]): Promise<void>
  removeDiagram(diagramId: string): Promise<void>
}

function newestFirst(items: VersionMeta[]) {
  return items.toSorted((a, b) => b.at - a.at)
}

export function memoryVersionStore(): VersionStore {
  const metas = new Map<string, VersionMeta>()
  const contents = new Map<string, string>()
  const ofDiagram = (diagramId: string) =>
    newestFirst([...metas.values()].filter((meta) => meta.diagramId === diagramId))
  return {
    list: async (diagramId) => ofDiagram(diagramId),
    load: async (id) => {
      const text = contents.get(id)
      return text === undefined ? null : migrate(JSON.parse(text))
    },
    put: async (meta, diagram, remove) => {
      metas.set(meta.id, meta)
      contents.set(meta.id, JSON.stringify(diagram))
      for (const id of remove) {
        metas.delete(id)
        contents.delete(id)
      }
    },
    removeDiagram: async (diagramId) => {
      for (const meta of ofDiagram(diagramId)) {
        metas.delete(meta.id)
        contents.delete(meta.id)
      }
    },
  }
}

const DB_NAME = 'dg-versions'
const META = 'meta'
const CONTENT = 'content'
const BY_DIAGRAM = 'diagram'

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('The version history request failed.'))
  })
}

function committed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('The version history did not save.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('The version history did not save.'))
  })
}

async function gzip(text: string): Promise<Blob> {
  return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob()
}

async function gunzip(blob: Blob): Promise<string> {
  return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text()
}

export function indexedDbVersionStore(): VersionStore {
  let opened: Promise<IDBDatabase> | null = null
  const database = () => {
    opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        db.createObjectStore(META, { keyPath: 'id' }).createIndex(BY_DIAGRAM, 'diagramId')
        db.createObjectStore(CONTENT)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('The version history did not open.'))
    })
    return opened
  }
  const list = async (diagramId: string) => {
    const db = await database()
    const index = db.transaction(META).objectStore(META).index(BY_DIAGRAM)
    return newestFirst(await done(index.getAll(diagramId) as IDBRequest<VersionMeta[]>))
  }
  return {
    list,
    load: async (id) => {
      const db = await database()
      const blob = await done(db.transaction(CONTENT).objectStore(CONTENT).get(id) as IDBRequest<Blob | undefined>)
      return blob ? migrate(JSON.parse(await gunzip(blob))) : null
    },
    put: async (meta, diagram, remove) => {
      const blob = await gzip(JSON.stringify(diagram))
      const db = await database()
      const transaction = db.transaction([META, CONTENT], 'readwrite')
      transaction.objectStore(META).put(meta)
      transaction.objectStore(CONTENT).put(blob, meta.id)
      for (const id of remove) {
        transaction.objectStore(META).delete(id)
        transaction.objectStore(CONTENT).delete(id)
      }
      await committed(transaction)
    },
    removeDiagram: async (diagramId) => {
      const ids = (await list(diagramId)).map((meta) => meta.id)
      const db = await database()
      const transaction = db.transaction([META, CONTENT], 'readwrite')
      for (const id of ids) {
        transaction.objectStore(META).delete(id)
        transaction.objectStore(CONTENT).delete(id)
      }
      await committed(transaction)
    },
  }
}

let active: VersionStore | null = null

/** Returns the version store: IndexedDB in a browser, memory elsewhere. */
export function versionStore(): VersionStore {
  active ??= typeof indexedDB === 'undefined' ? memoryVersionStore() : indexedDbVersionStore()
  return active
}

export function setVersionStore(store: VersionStore | null) {
  active = store
}
