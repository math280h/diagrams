import type { RepositoryEvent } from './repository'

type SaveFailedEvent = Extract<RepositoryEvent, { kind: 'save-failed' }>
type RemoveFailedEvent = Extract<RepositoryEvent, { kind: 'remove-failed' }>

/**
 * Returns a repository listener that shows failed saves and removes.
 *
 * A run of failed saves shows once. A failure shows again only after a save reaches storage. Each failed remove shows,
 * apart from a failed trash: the caller of the delete asks the user what to do.
 */
export function createSaveReporter(show: {
  saveFailed(event: SaveFailedEvent): void
  removeFailed(event: RemoveFailedEvent): void
}) {
  let shown = false
  return (event: RepositoryEvent) => {
    if (event.kind === 'saved') shown = false
    else if (event.kind === 'remove-failed') {
      if (event.reason !== 'trash') show.removeFailed(event)
    } else if (event.kind === 'save-failed' && !shown) {
      shown = true
      show.saveFailed(event)
    }
  }
}
