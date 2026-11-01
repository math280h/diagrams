import { create } from 'zustand'
import { createSerialQueue } from '@/lib/serial-queue'
import { newId } from '@/model/defaults'
import { describeChange, describeContent } from '@/model/diagram-diff'
import type { Diagram } from '@/model/schema'
import { fromDiagram, toStoredEdge, toStoredNode } from '@/persistence/serialize'
import { versionStore, type VersionMeta } from '@/persistence/version-store'

/** User edits within this time after the first edit of a version join that version. */
export const VERSION_WINDOW_MS = 5 * 60_000
export const MAX_VERSIONS = 200

interface VersionsState {
  diagramId: string | null
  /** The versions of the open diagram, newest first. */
  items: VersionMeta[]
  /** True after the version history failed to read or write. */
  failed: boolean
  /** The selected version, which the canvas shows instead of the current diagram once it loads, or `null`. */
  previewId: string | null
  /** The loaded version that the canvas shows. While another version loads, it is the version selected before. */
  preview: { id: string; diagram: Diagram } | null
  /** True if the store cannot read the selected version. */
  previewFailed: boolean
}

export const useVersions = create<VersionsState>(() => ({
  diagramId: null,
  items: [],
  failed: false,
  previewId: null,
  preview: null,
  previewFailed: false,
}))

/** Who made a change that the user did not make by hand, with the fields that version records. */
export type VersionMark = Pick<VersionMeta, 'author' | 'tool' | 'restoredAt'>

interface Head {
  diagramId: string
  latest: Diagram
  /** The content key of `latest`. */
  latestKey: string
  /** The newest version, while user edits can still join it. */
  open: VersionMeta | null
  /** The state before the open version. */
  base: Diagram
}

let head: Head | null = null
let mark: VersionMark | null = null
/** The versions of one diagram as the store holds them. */
let cache: { diagramId: string; items: VersionMeta[] } | null = null
const enqueue = createSerialQueue()
let last: Promise<unknown> = Promise.resolve()

function contentKey(diagram: Diagram) {
  const { nodes, edges } = fromDiagram(diagram)
  const stored = nodes.map((node) => {
    const { measured: _measured, ...rest } = toStoredNode(node)
    return rest
  })
  return JSON.stringify([diagram.name, diagram.theme, stored, edges.map(toStoredEdge), diagram.flows])
}

function run(task: () => Promise<void>) {
  last = enqueue(task).catch(() => useVersions.setState({ failed: true }))
}

async function itemsOf(diagramId: string) {
  if (cache?.diagramId !== diagramId) cache = { diagramId, items: await versionStore().list(diagramId) }
  return cache.items
}

function publish(diagramId: string) {
  if (cache?.diagramId === diagramId && useVersions.getState().diagramId === diagramId) {
    useVersions.setState({ items: cache.items })
  }
}

async function save(meta: VersionMeta, diagram: Diagram) {
  const items = [meta, ...(await itemsOf(meta.diagramId)).filter((item) => item.id !== meta.id)]
  await versionStore().put(
    meta,
    diagram,
    items.slice(MAX_VERSIONS).map((item) => item.id),
  )
  cache = { diagramId: meta.diagramId, items: items.slice(0, MAX_VERSIONS) }
  publish(meta.diagramId)
}

/** Starts the history of the diagram that the editor opened, and records its state if the history lacks it. */
export function beginVersions(diagram: Diagram) {
  const key = contentKey(diagram)
  head = { diagramId: diagram.id, latest: diagram, latestKey: key, open: null, base: diagram }
  mark = null
  cache = null
  useVersions.setState({ diagramId: diagram.id, items: [], previewId: null, preview: null, previewFailed: false })
  run(async () => {
    const [newest] = await itemsOf(diagram.id)
    const previous = newest ? await versionStore().load(newest.id) : null
    if (previous && contentKey(previous) === key) return publish(diagram.id)
    const now = Date.now()
    await save(
      {
        id: newId('v'),
        diagramId: diagram.id,
        startedAt: now,
        at: now,
        author: previous ? 'outside' : 'opened',
        summary: previous ? describeChange(previous, diagram) : describeContent(diagram),
      },
      diagram,
    )
  })
}

/** Ends the history of the diagram that the editor closed, and removes its diagrams from memory. */
export function endVersions(diagramId: string) {
  if (head?.diagramId === diagramId) head = null
}

/**
 * Runs a change and its save with the given author for the version that the save records.
 *
 * Saves outside `change` count as edits by the user.
 */
export function asVersionAuthor<T>(author: VersionMark, change: () => T): T {
  mark = author
  try {
    return change()
  } finally {
    mark = null
  }
}

/**
 * Records a saved state of the open diagram.
 *
 * Agent calls and restores each make a version. User edits join the newest version while it is a user version and
 * younger than {@link VERSION_WINDOW_MS}. A new version ends the preview of an older one.
 */
export function recordVersion(diagram: Diagram, now = Date.now()) {
  if (!head || head.diagramId !== diagram.id) return
  const key = contentKey(diagram)
  if (key === head.latestKey) return
  const by: VersionMark = mark ?? { author: 'you' }
  const open = head.open
  const meta: VersionMeta =
    by.author === 'you' && open?.author === 'you' && now - open.startedAt < VERSION_WINDOW_MS
      ? { ...open, at: now, summary: describeChange(head.base, diagram) }
      : {
          ...by,
          id: newId('v'),
          diagramId: diagram.id,
          startedAt: now,
          at: now,
          summary: describeChange(head.latest, diagram),
        }
  head = { ...head, latest: diagram, latestKey: key, open: meta, base: meta.id === open?.id ? head.base : head.latest }
  if (useVersions.getState().previewId !== null) previewVersion(null)
  run(() => save(meta, diagram))
}

/** The id of the preview that shows a diagram file as the last commit of its repository holds it. */
export const COMMIT_PREVIEW_ID = 'commit'

/** Shows a diagram that the history does not hold, for example the version in the last commit, on the canvas. */
export function previewDiagram(id: string, diagram: Diagram) {
  useVersions.setState({ previewId: id, preview: { id, diagram }, previewFailed: false })
}

/** Shows a version on the canvas, or the current diagram again with `null`. */
export function previewVersion(id: string | null) {
  if (id === null) {
    useVersions.setState({ previewId: null, preview: null, previewFailed: false })
    return
  }
  useVersions.setState({ previewId: id, previewFailed: false })
  const failed = () => {
    if (useVersions.getState().previewId === id) useVersions.setState({ preview: null, previewFailed: true })
  }
  versionStore()
    .load(id)
    .then(
      (diagram) => {
        if (!diagram) return failed()
        if (useVersions.getState().previewId === id) useVersions.setState({ preview: { id, diagram } })
      },
      () => {
        useVersions.setState({ failed: true })
        failed()
      },
    )
}

/** Resolves when the store has written all recorded versions. */
export function versionsSettled(): Promise<unknown> {
  return last
}

export function forgetVersions(diagramId: string) {
  if (cache?.diagramId === diagramId) cache = null
  run(() => versionStore().removeDiagram(diagramId))
}
