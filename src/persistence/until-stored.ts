import { repository } from './active-repository'

/**
 * Runs a save or remove of a diagram and waits until it reaches storage. In the browser this is at once. On the
 * desktop it is after the file write. The function also returns the failure of a save that fails at once.
 *
 * @returns The failure message, or `null` if storage took the change or `change` did not save.
 */
export async function untilStored(id: string, change: () => unknown): Promise<string | null> {
  let failure: string | null = null
  const stop = repository().subscribe((event) => {
    if (event.id !== id) return
    if (event.kind === 'save-failed' || event.kind === 'remove-failed') failure = event.message
    else if (event.kind === 'saved' || event.kind === 'removed') failure = null
  })
  try {
    change()
    await repository().settled()
    return failure
  } finally {
    stop()
  }
}
