import { useEffect } from 'react'
import { create } from 'zustand'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/error-message'
import { errorProblem, type Problem } from '@/lib/problem-report'
import { rememberProblem } from '@/reports/recent-problems'
import { showProblem } from './problem-store'
import { mergeDiagrams, type MergeChoice } from '@/model/diagram-merge'
import type { Diagram } from '@/model/schema'
import { repository } from '@/persistence/active-repository'
import { exportDiagramJson } from '@/persistence/library-actions'
import { fromDiagram, toDiagram } from '@/persistence/serialize'
import { storageCopy } from '@/persistence/storage-copy'
import { restoreContent } from './actions'
import { adoptLegacyView } from './device-views'
import { useDoc, type DocState } from './doc-store'
import { resetHistory } from './history'
import { MERGE_PREVIEW_ID, reviewChosen, reviewOf, useOutsideReview } from './outside-review'
import { useUnsaved, type UnsavedDiagram } from './unsaved'
import { beginVersions, endVersions, previewDiagram, previewVersion, recordVersion, useVersions } from './versions'

const SAVE_DELAY_MS = 400

export function openDiagram(diagram: Diagram) {
  const { nodes, edges } = fromDiagram(diagram)
  useDoc.setState({
    $schema: diagram.$schema,
    id: diagram.id,
    name: diagram.name,
    theme: diagram.theme,
    nodes,
    edges,
    flows: diagram.flows,
    createdAt: diagram.createdAt,
    rev: diagram.rev,
  })
  resetHistory()
}

export function currentDiagram(): Diagram {
  return toDiagram(useDoc.getState())
}

function persistedPart(state: DocState) {
  return [state.name, state.theme, state.nodes, state.edges, state.flows] as const
}

/** Returns the parts of a diagram that a save writes, apart from the save time and the rev. */
function savedContent(diagram: Diagram) {
  return JSON.stringify([diagram.name, diagram.theme, diagram.nodes, diagram.edges, diagram.flows])
}

/** Returns the parts of a diagram that the user changes: the saved parts without the measured sizes. */
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
  /** Returns true while a version from outside waits for the choice of the user. */
  held(): boolean
  loadNewer(): void
  keepThisVersion(): void
  /** Puts the merge of the version from outside into the editor, if it has no conflict. */
  merge(): void
  review(): void
  choose(keys: readonly string[], choice: MergeChoice): void
  /** Puts the merge of the review into the editor, if the review has a choice for each conflict. */
  applyReview(): void
}

type OutsideVersion = { kind: 'newer'; theirs: Diagram } | { kind: 'unreadable'; problem: Problem }

const UNREADABLE_TITLE = 'The newer version cannot be read.'

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
 * change of only the measured sizes does not count. Otherwise the session offers the newer version.
 * Until the user loads it or keeps the open version, a save only records a version. A version from outside that the
 * app cannot read gets no save.
 *
 * The session merges a readable version from outside with the open diagram. The base of the merge is the version
 * that the session loaded last or that storage took last.
 */
function startSession(diagram: Diagram): Session {
  const id = diagram.id
  let timer: ReturnType<typeof setTimeout> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let failures = 0
  let lastSaved = savedContent(currentDiagram())
  let lastUserContent = userContent(currentDiagram())
  let base = currentDiagram()
  let sentToStorage: Diagram | null = null
  let outside: OutsideVersion | null = null
  const userChangeWaits = () =>
    failures > 0 || ((timer !== undefined || outside !== null) && userContent(currentDiagram()) !== lastUserContent)

  const save = () => {
    clearTimeout(timer)
    timer = undefined
    clearTimeout(retryTimer)
    retryTimer = undefined
    const state = useDoc.getState()
    if (state.id !== id) return
    const next = toDiagram({ ...state, rev: state.rev + 1 })
    if (outside) {
      recordVersion(next)
      showOutside()
      return
    }
    const content = savedContent(next)
    if (content === lastSaved && failures === 0) return
    lastSaved = content
    sentToStorage = next
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
    base = currentDiagram()
    sentToStorage = null
    lastSaved = savedContent(base)
    lastUserContent = userContent(base)
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
    if (event.kind === 'saved') {
      if (sentToStorage) base = sentToStorage
      sentToStorage = null
      markStored()
    } else if (event.kind === 'save-failed') retryLater(event)
  })

  const stopDoc = useDoc.subscribe((state, previous) => {
    if (state.id !== id) return
    const next = persistedPart(state)
    const before = persistedPart(previous)
    if (next.every((value, index) => value === before[index])) return
    clearTimeout(timer)
    timer = setTimeout(save, SAVE_DELAY_MS)
  })
  const noticeId = `changed:${id}`
  let noticeShown = false
  const dismissNotice = () => {
    if (noticeShown) toast.dismiss(noticeId)
    noticeShown = false
  }
  const endReview = () => {
    if (!useOutsideReview.getState().review) return
    useOutsideReview.setState({ review: null })
    if (useVersions.getState().previewId === MERGE_PREVIEW_ID) previewVersion(null)
  }
  const stopVersions = useVersions.subscribe((state, previous) => {
    if (previous.previewId !== MERGE_PREVIEW_ID || state.previewId === MERGE_PREVIEW_ID) return
    if (!useOutsideReview.getState().review) return
    useOutsideReview.setState({ review: null })
    showOutside()
  })
  const refreshReview = () => {
    const current = useOutsideReview.getState().review
    if (!current || outside?.kind !== 'newer') return
    const next = reviewOf(base, currentDiagram(), outside.theirs, current.choices)
    useOutsideReview.setState({ review: next })
    previewDiagram(MERGE_PREVIEW_ID, next.result.diagram)
  }
  const review = () => {
    if (outside?.kind !== 'newer') return
    dismissNotice()
    useOutsideReview.setState({ review: reviewOf(base, currentDiagram(), outside.theirs) })
    flush()
    refreshReview()
  }
  const takeMerge = (merged: Diagram) => {
    endReview()
    outside = null
    dismissNotice()
    restoreContent(merged)
    useDoc.setState({ $schema: merged.$schema })
    lastSaved = ''
    save()
  }
  const takeNewer = (loaded: Diagram) => {
    endReview()
    if (outside) recordVersion(currentDiagram())
    outside = null
    dismissNotice()
    reload(loaded)
  }
  const holdUnreadable = (error: unknown) => {
    const problem = errorProblem(UNREADABLE_TITLE, error)
    rememberProblem(problem)
    endReview()
    outside = { kind: 'unreadable', problem }
    showOutside()
  }
  const readStored = () => {
    try {
      return repository().load(id)
    } catch (error) {
      holdUnreadable(error)
      return null
    }
  }
  const loadNewer = () => {
    const loaded = readStored()
    if (loaded) takeNewer(loaded)
  }
  const keepThisVersion = () => {
    endReview()
    outside = null
    dismissNotice()
    lastSaved = ''
    save()
  }
  const merge = () => {
    if (outside?.kind !== 'newer') return
    const result = mergeDiagrams(base, currentDiagram(), outside.theirs)
    if (result.conflicts.length > 0) showOutside()
    else takeMerge(result.diagram)
  }
  const showOutside = () => {
    if (!outside) return
    if (outside.kind === 'newer' && useOutsideReview.getState().review) {
      refreshReview()
      return
    }
    noticeShown = true
    if (outside.kind === 'newer') {
      const conflicts = mergeDiagrams(base, currentDiagram(), outside.theirs).conflicts.length
      const run = (action: () => void) => (event: { preventDefault(): void }) => {
        event.preventDefault()
        action()
      }
      toast.warning(storageCopy().changedElsewhere, {
        id: noticeId,
        description:
          conflicts === 0
            ? 'Your changes here do not save until you choose.'
            : `${conflicts === 1 ? '1 change needs' : `${conflicts} changes need`} a choice before your changes save.`,
        duration: Infinity,
        action:
          conflicts === 0 ? { label: 'Merge', onClick: run(merge) } : { label: 'Load newer', onClick: run(loadNewer) },
        cancel: { label: 'Review', onClick: review },
      })
      return
    }
    const { problem } = outside
    toast.error(UNREADABLE_TITLE, {
      id: noticeId,
      description: 'Your changes do not save over it. Export the diagram to keep them in a file.',
      duration: Infinity,
      action: {
        label: 'Export',
        onClick: (event) => {
          event.preventDefault()
          exportDiagramJson(currentDiagram())
        },
      },
      cancel: { label: 'More details', onClick: () => showProblem(problem) },
    })
  }
  const stopRepository = repository().subscribe((event) => {
    if (event.kind !== 'changed' || event.id !== id) return
    const stored = repository()
      .list()
      .some((meta) => meta.id === id)
    if (!stored) {
      if (outside && timer === undefined) timer = setTimeout(save, SAVE_DELAY_MS)
      endReview()
      outside = null
      noticeShown = true
      toast.warning(storageCopy().removedElsewhere, {
        id: noticeId,
        description: 'The diagram stays open here, and your next change saves it again.',
        duration: Infinity,
        action: undefined,
        cancel: undefined,
      })
      return
    }
    const loaded = readStored()
    if (!loaded) return
    if (!userChangeWaits()) {
      takeNewer(loaded)
      return
    }
    outside = { kind: 'newer', theirs: loaded }
    showOutside()
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
    held: () => outside !== null,
    loadNewer,
    keepThisVersion,
    merge,
    review,
    choose(keys, choice) {
      const current = useOutsideReview.getState().review
      if (!current) return
      const choices = new Map(current.choices)
      for (const key of keys) choices.set(key, choice)
      useOutsideReview.setState({ review: { ...current, choices } })
      refreshReview()
    },
    applyReview() {
      const current = useOutsideReview.getState().review
      if (current && reviewChosen(current)) takeMerge(current.result.diagram)
    },
    stop() {
      clearTimeout(timer)
      timer = undefined
      markStored()
      endReview()
      dismissNotice()
      stopVersions()
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
 * Returns true while a version from outside waits for the choice of the user. Saves of the open diagram then write
 * nothing.
 */
export function outsideVersionWaits(): boolean {
  return session?.held() ?? false
}

/** Replaces the open diagram with the version from outside that waits. */
export function loadNewerVersion() {
  session?.loadNewer()
}

/** Saves the open diagram over the version from outside that waits. */
export function keepOpenVersion() {
  session?.keepThisVersion()
}

/** Shows the merge of the open diagram and the version from outside that waits over the canvas. */
export function reviewOutsideVersion() {
  session?.review()
}

/** Sets the choice for conflicts of the review. A choice that does not apply to a conflict goes away. */
export function chooseMerge(keys: readonly string[], choice: MergeChoice) {
  session?.choose(keys, choice)
}

/**
 * Puts the merge of the review into the editor as one undo step and saves it.
 *
 * It does nothing while a conflict of the review has no choice.
 */
export function applyOutsideReview() {
  session?.applyReview()
}

/** Closes the review. The version from outside still waits for the choice of the user. */
export function cancelOutsideReview() {
  previewVersion(null)
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
 * The stored view of a diagram of an earlier format becomes the view of this device ({@link adoptLegacyView}).
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
      adoptLegacyView(id, repository().storedText(id))
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
