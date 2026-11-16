import { toast } from 'sonner'
import { create } from 'zustand'
import { errorProblem, type Problem } from '@/lib/problem-report'
import { rememberProblem } from '@/reports/recent-problems'

interface ProblemState {
  /** The problem that the problem dialog shows, or `null`. */
  problem: Problem | null
  /** The source that keeps the shown problem up to date with {@link updateProblem}, or `null`. */
  key: string | null
}

export const useProblemStore = create<ProblemState>(() => ({ problem: null, key: null }))

/**
 * Opens the problem dialog of the app.
 *
 * @param options.key - A name for a problem that can change or end while the dialog shows, such as the state of a
 *   server. The source then calls {@link updateProblem} with the same key.
 */
export function showProblem(problem: Problem, options: { key?: string } = {}) {
  rememberProblem(problem)
  useProblemStore.setState({ problem, key: options.key ?? null })
}

/** Replaces the shown problem of the key, or closes the dialog when the problem ended. Other problems stay. */
export function updateProblem(key: string, problem: Problem | null) {
  if (useProblemStore.getState().key !== key) return
  useProblemStore.setState(problem ? { problem } : { problem: null, key: null })
}

export function closeProblem() {
  useProblemStore.setState({ problem: null, key: null })
}

/**
 * Shows a failure as an error toast with a "More details" action, which opens the problem dialog with the details for
 * a bug report.
 *
 * @param error - The value that the app caught, or the message of the failure.
 * @param options.description - The line under the title. Without it, the toast shows the error message.
 * @param options.facts - Facts about the action that failed, for the bug report.
 */
export function reportError(
  title: string,
  error: unknown,
  options: { description?: string; facts?: readonly string[]; id?: string; duration?: number } = {},
) {
  const problem = errorProblem(title, error, options.facts)
  rememberProblem(problem)
  toast.error(title, {
    id: options.id,
    duration: options.duration,
    description: options.description ?? problem.message,
    action: { label: 'More details', onClick: () => showProblem(problem) },
  })
}
