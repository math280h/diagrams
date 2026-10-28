export interface UnreleasedChange {
  title: string
  /** The number from the `(#23)` at the end of a squash merge title, or `null` without one. */
  pullRequest: number | null
  sha: string
  /** The commit time, in milliseconds since the epoch. */
  committedAt: number
}

/** The commits on `main` after the newest release, the newest first. */
export interface UnreleasedChanges {
  /** The tag of the newest release. */
  base: string
  changes: UnreleasedChange[]
}
