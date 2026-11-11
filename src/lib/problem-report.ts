/** A problem to show to the user, with its details for a bug report. */
export interface Problem {
  title: string
  /** What happened and what the user can do, in plain words. */
  message: string
  /** Facts for a bug report, one per line, such as a state or a port. They hold no secret and no personal data. */
  facts: readonly string[]
}

/**
 * Returns the text to copy into a bug report: the app and the system, the facts and the message.
 *
 * @param about - The app version and the system, as one line.
 */
export function problemReport(about: string, problem: Problem): string {
  return [about, ...problem.facts, problem.message].join('\n')
}
