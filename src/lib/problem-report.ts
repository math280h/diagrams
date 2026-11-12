import { errorMessage } from './error-message'

const STACK_LINES = 8

/** A problem to show to the user, with its details for a bug report. */
export interface Problem {
  title: string
  /** What happened and what the user can do, in plain words. */
  message: string
  /** Facts for a bug report, one per line, such as a state, a port or a stack line. They hold no secret. */
  facts: readonly string[]
  /** The error that the app caught, for a problem report. */
  error?: { name: string; stack: string }
}

/**
 * Returns the text to copy into a bug report: the app and the system, the title, the message and the facts.
 *
 * @param about - The app version and the system, as one line.
 */
export function problemReport(about: string, problem: Problem): string {
  return [about, problem.title, problem.message, ...problem.facts].join('\n')
}

/**
 * Returns a problem for a value that the app caught. An `Error` adds its name and the start of its stack to the facts.
 *
 * @param facts - Facts about the action that failed, before the facts of the error.
 */
export function errorProblem(title: string, error: unknown, facts: readonly string[] = []): Problem {
  if (!(error instanceof Error)) return { title, message: errorMessage(error), facts }
  const stack = (error.stack ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '))
    .slice(0, STACK_LINES)
  return {
    title,
    message: error.message,
    facts: [...facts, `Error: ${error.name}`, ...stack],
    error: { name: error.name, stack: error.stack ?? '' },
  }
}
