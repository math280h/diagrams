import { useEffect, useId } from 'react'
import { toast } from 'sonner'
import { create } from 'zustand'
import { errorProblem } from '@/lib/problem-report'
import { rememberProblem } from '@/reports/recent-problems'
import { saveAndSettle } from '@/store/document'
import { explainFileLoadsWith, showProblem } from '@/store/problem-store'
import { versionsSettled } from '@/store/versions'
import { FileLoadError, isFileLoadError, onFileLoadFailure } from './file-load'
import { reloadGuard, serverBuildOf, type ServerBuild } from './reload-guard'

const NOTICE_ID = 'new-version'
const PAGE_FETCH_TIMEOUT_MS = 4000
const UNKNOWN_PART = 'Could not load a part of the app'
const STILL_OLD = 'The reload did not get the new version, so a file is still missing. Try again in a few minutes.'
const PAGE_STILL_OLD = 'The reload did not get the new version of Diagrams. Try again in a few minutes.'
const OPEN_DIALOG = '[data-slot="dialog-content"][data-open]:not([data-reload-question])'
const OPEN_DIALOG_STOPS = 'The open dialog closes. Text that you typed in it is not kept.'

let watchedEntryScript: string | null = null
const claimed = new WeakSet<object>()
let checking: Promise<ServerBuild> | null = null

function claim(error: unknown) {
  if (typeof error === 'object' && error !== null) claimed.add(error)
}

function isClaimed(error: unknown) {
  return typeof error === 'object' && error !== null && claimed.has(error)
}

function tabStorage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function checkServer(entry: string): Promise<ServerBuild> {
  checking ??= fetch(entry, { method: 'HEAD', cache: 'no-store' })
    .then(
      (response) => serverBuildOf({ status: response.status, contentType: response.headers.get('content-type') }),
      () => serverBuildOf(null),
    )
    .finally(() => {
      checking = null
    })
  return checking
}

/**
 * Asks the server whether it still has the build of this tab.
 *
 * @returns `unknown` while the app does not watch for new versions, as in the desktop app.
 */
export function serverBuild(): Promise<ServerBuild> {
  return watchedEntryScript === null ? Promise.resolve('unknown') : checkServer(watchedEntryScript)
}

const useReloadHolds = create<{ holds: ReadonlyMap<string, string> }>(() => ({ holds: new Map() }))

/**
 * Makes a reload for a new version ask first while `stops` is set.
 *
 * @param stops - What the reload stops, as one sentence for the question, for example "The video export stops.".
 */
export function useReloadHold(stops: string | null) {
  const id = useId()
  useEffect(() => {
    if (stops === null) return
    useReloadHolds.setState(({ holds }) => ({ holds: new Map(holds).set(id, stops) }))
    return () =>
      useReloadHolds.setState(({ holds }) => {
        const next = new Map(holds)
        next.delete(id)
        return { holds: next }
      })
  }, [id, stops])
}

export interface ReloadQuestion {
  /** What the reload stops, one sentence each. */
  stops: string[]
  /** True if the last changes of the open diagram are not in storage. */
  unsaved: boolean
}

/** The question that shows before a reload for a new version stops work, or `null`. */
export const useReloadQuestion = create<{ question: ReloadQuestion | null }>(() => ({ question: null }))

/** Saves the open diagram and its versions, then returns the question for the work that a reload stops. */
async function reloadQuestion(): Promise<ReloadQuestion | null> {
  const unsaved = (await saveAndSettle()) !== null
  await versionsSettled()
  const stops = [...useReloadHolds.getState().holds.values()]
  if (document.querySelector(OPEN_DIALOG) !== null) stops.push(OPEN_DIALOG_STOPS)
  return unsaved || stops.length > 0 ? { stops, unsaved } : null
}

async function fetchNewPage() {
  if (!navigator.serviceWorker?.controller) return
  await fetch(import.meta.env.BASE_URL, {
    cache: 'no-store',
    signal: AbortSignal.timeout(PAGE_FETCH_TIMEOUT_MS),
  }).catch(() => undefined)
}

/**
 * Reloads the tab for a new version now, without a question. The tab records the reload, so that it does not reload
 * again when the reload gets the same build.
 */
export async function reloadForNewVersion() {
  useReloadQuestion.setState({ question: null })
  if (watchedEntryScript !== null) reloadGuard(tabStorage(), watchedEntryScript).mark()
  await fetchNewPage()
  window.location.reload()
}

/** Saves the open diagram, then reloads the tab for a new version, or asks first if the reload stops work. */
async function askToReload() {
  const question = await reloadQuestion()
  if (question) useReloadQuestion.setState({ question })
  else await reloadForNewVersion()
}

function showNewVersion() {
  toast.info('A new version of Diagrams is available', {
    id: NOTICE_ID,
    description: 'Reload to keep working. The app saves your changes first.',
    duration: Infinity,
    action: {
      label: 'Reload',
      onClick: (event) => {
        event.preventDefault()
        void askToReload()
      },
    },
  })
}

function showStillOld(title: string | null, error: unknown) {
  const problem = errorProblem(title ?? UNKNOWN_PART, error)
  rememberProblem(problem)
  toast.error(problem.title, {
    id: NOTICE_ID,
    description: STILL_OLD,
    duration: Infinity,
    action: { label: 'More details', onClick: () => showProblem(problem) },
  })
}

/**
 * Tells the user about a new version when a file of the app did not load because the server has a new build.
 *
 * @param title - What failed, for example "Tidy up failed.", or `null` when no action of the user failed.
 * @returns True if it showed a notice: about the new version, or that a reload did not get it.
 */
async function explainFileLoad(title: string | null, error: unknown): Promise<boolean> {
  const entry = watchedEntryScript
  if (entry === null || !isFileLoadError(error)) return false
  claim(error)
  if ((await checkServer(entry)) !== 'replaced') return false
  if (reloadGuard(tabStorage(), entry).reloadedBefore()) showStillOld(title, error)
  else showNewVersion()
  return true
}

function failedToLoad(error: unknown) {
  setTimeout(() => {
    if (!isClaimed(error)) void explainFileLoad(null, error)
  }, 0)
}

/**
 * Wraps the import of a page. When the server has a new build, the tab saves the open diagram and reloads once to open
 * the page with the new version. A reload that gets the same build shows an error on the page.
 */
export function pageImport<T>(load: () => Promise<T>): () => Promise<T> {
  return () =>
    load().catch(async (error: unknown) => {
      const entry = watchedEntryScript
      if (entry === null || !isFileLoadError(error)) throw error
      claim(error)
      if ((await checkServer(entry)) !== 'replaced') throw error
      const guard = reloadGuard(tabStorage(), entry)
      if (guard.reloadedBefore()) throw new FileLoadError(PAGE_STILL_OLD)
      if ((await reloadQuestion()) === null && guard.mark()) {
        await fetchNewPage()
        window.location.reload()
        return new Promise<never>(() => undefined)
      }
      showNewVersion()
      throw new FileLoadError('This page needs the new version of Diagrams. Reload to open it.')
    })
}

/**
 * Watches for files of the app that do not load because a new version of the website replaced the build of this tab.
 * The app then offers a reload. Call it once, on the website only.
 *
 * @returns A function that stops it.
 */
export function watchNewVersions(): () => void {
  const scripts = document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')
  const entry = scripts[scripts.length - 1]?.src
  if (!entry) return () => undefined
  watchedEntryScript = entry
  explainFileLoadsWith(explainFileLoad)
  const stopFiles = onFileLoadFailure(failedToLoad)
  const onPreloadError = (event: VitePreloadErrorEvent) => failedToLoad(event.payload)
  const onFontError = (event: FontFaceSetLoadEvent) => {
    const families = [...new Set(event.fontfaces.map((face) => face.family))].join(', ')
    failedToLoad(new FileLoadError(`The font ${families} did not load.`))
  }
  window.addEventListener('vite:preloadError', onPreloadError)
  document.fonts.addEventListener('loadingerror', onFontError)
  return () => {
    watchedEntryScript = null
    explainFileLoadsWith(null)
    stopFiles()
    window.removeEventListener('vite:preloadError', onPreloadError)
    document.fonts.removeEventListener('loadingerror', onFontError)
  }
}
