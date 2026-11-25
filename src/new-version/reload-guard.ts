/**
 * What the server has of the build that runs in this tab.
 *
 * `replaced` means that a new version took the place of this build. `unknown` means that the server did not answer,
 * for example without internet.
 */
export type ServerBuild = 'same' | 'replaced' | 'unknown'

/**
 * Reads the answer of the server to a request for the entry script of this tab.
 *
 * Some servers send the page for a file that they do not have, so an HTML answer counts as a missing script.
 *
 * @param answer - The status and the content type of the answer, or `null` when no answer came.
 */
export function serverBuildOf(answer: { status: number; contentType: string | null } | null): ServerBuild {
  if (answer === null) return 'unknown'
  if (answer.status === 404 || answer.status === 410) return 'replaced'
  if (answer.status < 200 || answer.status >= 300) return 'unknown'
  return answer.contentType?.includes('text/html') ? 'replaced' : 'same'
}

const RELOADED_FROM_KEY = 'dg:reloaded-for-new-version'

export interface ReloadGuard {
  /** Returns true if this tab reloaded for a new version before and got the same build again. */
  reloadedBefore(): boolean
  /**
   * Records that this tab reloads for a new version now.
   *
   * @returns False if the tab cannot keep the record. An automatic reload must then not start.
   */
  mark(): boolean
}

/**
 * Returns the guard that keeps a tab from a reload loop when the reload does not get the new version.
 *
 * The record names the build that asked for the reload. A reload that gets a new build can thus reload again for the
 * next version.
 *
 * @param storage - The session storage of the tab, or `null` if the browser blocks it.
 * @param build - A name of the build that runs in the tab, such as the address of its entry script.
 */
export function reloadGuard(storage: Pick<Storage, 'getItem' | 'setItem'> | null, build: string): ReloadGuard {
  return {
    reloadedBefore() {
      try {
        return storage?.getItem(RELOADED_FROM_KEY) === build
      } catch {
        return false
      }
    },
    mark() {
      if (!storage) return false
      try {
        storage.setItem(RELOADED_FROM_KEY, build)
        return storage.getItem(RELOADED_FROM_KEY) === build
      } catch {
        return false
      }
    },
  }
}
