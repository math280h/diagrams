import { create } from 'zustand'
import { errorProblem, type Problem } from '@/lib/problem-report'
import { takeSnapshot } from '@/store/doc-store'
import type { ProblemSubject } from './report-store'

export type RecentProblem = Omit<ProblemSubject, 'kind'> & { id: string }

const MAX_RECENT = 20
const REPEAT_GAP_MS = 2000
export const UNCAUGHT_TITLE = 'The app hit an unexpected error'
// Browsers report this message for a ResizeObserver callback that changes the layout again. It is not a failure.
const RESIZE_OBSERVER_LOOP = /^ResizeObserver loop/
// Browsers give this message, without details, for an error in a script from another origin.
const CROSS_ORIGIN_SCRIPT_ERROR = 'Script error.'

/** The problems of this session that the app showed or caught. The list stays in memory only. */
export const useRecentProblems = create<{ problems: RecentProblem[] }>(() => ({ problems: [] }))

let lastId = 0

/** Adds a problem to the recent problems, once for the same problem and once for a repeat within 2 seconds. */
export function rememberProblem(problem: Problem, now = Date.now()) {
  const { problems } = useRecentProblems.getState()
  if (problems.some((item) => item.problem === problem)) return
  const last = problems[0]
  const repeat =
    last !== undefined &&
    last.problem.title === problem.title &&
    last.problem.message === problem.message &&
    now - last.time < REPEAT_GAP_MS
  if (repeat) return
  lastId += 1
  const item: RecentProblem = { id: String(lastId), time: now, problem, diagram: takeSnapshot() }
  useRecentProblems.setState({ problems: [item, ...problems].slice(0, MAX_RECENT) })
}

/** Returns the report subject of a problem, with the time and the diagram that the recent problems keep for it. */
export function problemSubject(problem: Problem): ProblemSubject {
  const recent = useRecentProblems.getState().problems.find((item) => item.problem === problem)
  return { kind: 'problem', problem, time: recent?.time ?? Date.now(), diagram: recent?.diagram ?? takeSnapshot() }
}

export function forgetProblem(id: string) {
  useRecentProblems.setState(({ problems }) => ({ problems: problems.filter((item) => item.id !== id) }))
}

function ignored(message: string): boolean {
  return RESIZE_OBSERVER_LOOP.test(message) || message === CROSS_ORIGIN_SCRIPT_ERROR
}

/** Adds each error that no code of the app caught to the recent problems. Returns a function that stops it. */
export function captureUncaughtErrors(target: Window = window): () => void {
  const onError = (event: ErrorEvent) => {
    if (ignored(event.message)) return
    rememberProblem(errorProblem(UNCAUGHT_TITLE, event.error ?? event.message))
  }
  const onRejection = (event: PromiseRejectionEvent) => rememberProblem(errorProblem(UNCAUGHT_TITLE, event.reason))
  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onRejection)
  return () => {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onRejection)
  }
}
