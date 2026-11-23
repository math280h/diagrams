import { useEffect } from 'react'
import { create } from 'zustand'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/error-message'
import { reportError } from './problem-store'
import type { Diagram } from '@/model/schema'
import { repository } from '@/persistence/active-repository'
import { fromDiagram, toDiagram } from '@/persistence/serialize'
import { storageCopy } from '@/persistence/storage-copy'
import { useDoc, type DocState } from './doc-store'
import { resetHistory } from './history'
import { useUnsaved, type UnsavedDiagram } from './unsaved'
import { beginVersions, endVersions, recordVersion } from './versions'

const SAVE_DELAY_MS = 400

export function openDiagram(diagram: Diagram) {
  const { nodes, edges } = fromDiagram(diagram)
  useDoc.setState({
    id: diagram.id,
    name: diagram.name,
    theme: diagram.theme,
    nodes,
    edges,
    flows: diagram.flows,
    viewport: diagram.viewport,
    createdAt: diagram.createdAt,
    rev: diagram.rev,
  })
  resetHistory()
}

export function currentDiagram(): Diagram {
  return toDiagram(useDoc.getState())
}

function persistedPart(state: DocState) {
  return [state.name, state.theme, state.nodes, state.edges, state.flows, state.viewport] as const
}

/** Returns the parts of a diagram that a save writes, apart from the save time and the rev. */
function savedContent(diagram: Diagram) {
  return JSON.stringify([diagram.name, diagram.theme, diagram.nodes, diagram.edges, diagram.flows, diagram.viewport])
}

/** Returns the parts of a diagram that the user changes: the saved parts without the viewport and measured sizes. */
function userContent(diagram: Diagram) {
  const nodes = diagram.nodes.map(({ measured: _measured, ...node }) => node)
  return JSON.stringify([diagram.name, diagram.theme, nodes, diagram.edges, diagram.flows])
}

/** Delays before each new try of a save that failed. The last delay repeats. */
export const SAVE_RETRY_DELAYS_MS = [2000, 5000, 10_000, 30_000, 60_000]

interface Session {
  id: string
  /** Saves now if a save is due or the last save failed. */
  flush(): void
  /** Takes a diagram that the app loaded again as the saved state. */
  reload(diagram: Diagram): void
  /** Stops the saves and the listeners. The session drops a due save. */
  stop(): void
}

/**
 * Saves the changes of the open diagram until the session stops.
 *
 * A save runs {@link SAVE_DELAY_MS} after the last change, when the page hides, and on {@link Session.flush}. It
 * writes nothing when the content is the same as at the open, after a reload or at the last save. It compares the
 * content in the form that a save writes. For example, a change of only the selection writes nothing.
 *
 * After a save fails, {@link useUnsaved} holds the diagram, and the session saves again after each delay of
 * {@link SAVE_RETRY_DELAYS_MS}, on the next change and on flush, until a save reaches storage.
 *
 * A change from outside loads at once, unless a change of the user waits for its save or did not reach storage. A
 * change of only the viewport or the measured sizes does not count. Otherwise the session offers the newer version.
 */
function startSession(diagram: Diagram): Session {
  const id = diagram.id
  let timer: ReturnType<typeof setTimeout> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let failures = 0
  let lastSaved = savedContent(currentDiagram())
  let lastUserContent = userContent(currentDiagram())
  const userChangeWaits = () =>
    failures > 0 || (timer !== undefined && userContent(currentDiagram()) !== lastUserContent)

  const save = () => {
    clearTimeout(timer)
    timer = undefined
    clearTimeout(retryTimer)
    retryTimer = undefined
    const state = useDoc.getState()
    if (state.id !== id) return
    const next = toDiagram({ ...state, rev: state.rev + 1 })
    const content = savedContent(next)
    if (content === lastSaved && failures === 0) return
    lastSaved = content
    lastUserContent = userContent(next)
    if (repository().save(next).ok) useDoc.setState({ rev: next.rev })
    recordVersion(next)
  }
  const flush = () => {
    if (timer !== undefined || failures > 0) save()
  }
  const markStored = () => {
    failures = 0
    clearTimeout(retryTimer)
    retryTimer = undefined
    if (useUnsaved.getState().diagram?.id === id) useUnsaved.setState({ diagram: null })
  }
  const reload = (loaded: Diagram) => {
    clearTimeout(timer)
    timer = undefined
    markStored()
    openDiagram(loaded)
    beginVersions(loaded)
    lastSaved = savedContent(currentDiagram())
    lastUserContent = userContent(currentDiagram())
  }
  const retryLater = (failure: Omit<UnsavedDiagram, 'id'>) => {
    const delayMs = SAVE_RETRY_DELAYS_MS[Math.min(failures, SAVE_RETRY_DELAYS_MS.length - 1)]
    failures++
    clearTimeout(retryTimer)
    retryTimer = setTimeout(save, delayMs)
    useUnsaved.setState({ diagram: { id, reason: failure.reason, message: failure.message } })
  }
  const stopOutcomes = repository().subscribe((event) => {
    if (event.id !== id) return
    if (event.kind === 'saved') markStored()
    else if (event.kind === 'save-failed') retryLater(event)
  })

  const stopDoc = useDoc.subscribe((state, previous) => {
    if (state.id !== id) return
    const next = persistedPart(state)
    const before = persistedPart(previous)
    if (next.every((value, index) => value === before[index])) return
    clearTimeout(timer)
    timer = setTimeout(save, SAVE_DELAY_MS)
  })
  const loadNewer = () => {
    try {
      const loaded = repository().load(id)
      if (loaded) reload(loaded)
    } catch (error) {
      reportError('The newer version cannot be read.', error)
    }
  }
  let noticeShown = false
  const stopRepository = repository().subscribe((event) => {
    if (event.kind !== 'changed' || event.id !== id) return
    const stored = repository()
      .list()
      .some((meta) => meta.id === id)
    if (!stored) {
      noticeShown = true
      toast.warning(storageCopy().removedElsewhere, {
        id: `changed:${id}`,
        description: 'The diagram stays open here, and your next change saves it again.',
        duration: Infinity,
      })
      return
    }
    if (!userChangeWaits()) {
      if (noticeShown) toast.dismiss(`changed:${id}`)
      noticeShown = false
      loadNewer()
      return
    }
    noticeShown = true
    toast.warning(storageCopy().changedElsewhere, {
      id: `changed:${id}`,
      description: 'Load the newer version, or keep this version and save over it.',
      duration: Infinity,
      action: { label: 'Load newer', onClick: loadNewer },
    })
  })
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush()
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
  }

  return {
    id,
    flush,
    reload,
    stop() {
      clearTimeout(timer)
      timer = undefined
      markStored()
      stopDoc()
      stopRepository()
      stopOutcomes()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility)
        window.removeEventListener('pagehide', flush)
      }
    },
  }
}

let session: Session | null = null

/** Loads a diagram into the document store and saves its later changes until {@link closeDiagramSession}. */
export function openDiagramSession(diagram: Diagram) {
  session?.stop()
  openDiagram(diagram)
  beginVersions(diagram)
  session = startSession(diagram)
}

/**
 * Stops the saves of the open diagram.
 *
 * @param save - If false, the session drops a due save, for example after the user deletes the diagram.
 */
export function closeDiagramSession(id: string, save = true) {
  if (session?.id !== id) return
  if (save) session.flush()
  session.stop()
  session = null
  endVersions(id)
}

export function flushPendingSave() {
  session?.flush()
}

/**
 * Saves the open diagram now and waits until storage takes or refuses each save.
 *
 * @returns The open diagram if its changes are still not in storage, else `null`.
 */
export async function saveAndSettle(): Promise<UnsavedDiagram | null> {
  flushPendingSave()
  await repository().settled()
  return useUnsaved.getState().diagram
}

/** Stops the saves of the open diagram and drops its changes that are not in storage. */
export function discardUnsavedChanges() {
  if (!session) return
  const { id } = session
  closeDiagramSession(id, false)
  repository().discardUnstored?.(id)
}

/** Returns the id of the diagram whose changes the editor saves, or `null` while no editor shows one. */
export function openDiagramId(): string | null {
  return session?.id ?? null
}

export type LoadStatus = { kind: 'loading' | 'missing' | 'ready' } | { kind: 'invalid'; message: string }

const useLoadState = create<{ id: string | null; status: LoadStatus }>(() => ({
  id: null,
  status: { kind: 'loading' },
}))

/**
 * Waits until the editor has loaded a diagram.
 *
 * @returns The load status of that diagram, never `loading`.
 * @throws Error If the diagram does not load within the timeout.
 */
export function whenDiagramReady(id: string, timeoutMs = 10_000): Promise<LoadStatus> {
  const settled = () => {
    const state = useLoadState.getState()
    return state.id === id && state.status.kind !== 'loading' ? state.status : null
  }
  const now = settled()
  if (now) return Promise.resolve(now)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe()
      reject(new Error(`The diagram ${id} did not open within ${timeoutMs} ms.`))
    }, timeoutMs)
    const unsubscribe = useLoadState.subscribe(() => {
      const status = settled()
      if (!status) return
      clearTimeout(timer)
      unsubscribe()
      resolve(status)
    })
  })
}

/**
 * Loads a diagram into the document store and saves later changes to the repository while the editor shows it.
 *
 * @returns `loading`, `missing`, `invalid` with a message, or `ready`.
 */
export function useDiagramDocument(id: string): LoadStatus {
  const loaded = useLoadState()

  useEffect(() => {
    try {
      const diagram = repository().load(id)
      if (!diagram) {
        useLoadState.setState({ id, status: { kind: 'missing' } })
        return
      }
      openDiagramSession(diagram)
      useLoadState.setState({ id, status: { kind: 'ready' } })
    } catch (error) {
      useLoadState.setState({ id, status: { kind: 'invalid', message: errorMessage(error) } })
      return
    }
    return () => {
      closeDiagramSession(id)
      if (useLoadState.getState().id === id) useLoadState.setState({ id: null, status: { kind: 'loading' } })
    }
  }, [id])

  return loaded.id === id ? loaded.status : { kind: 'loading' }
}
