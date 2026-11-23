import { create } from 'zustand'
import { repository } from './active-repository'

const ASKED_AT_KEY = 'dg:persist-asked-at'
const ASK_AGAIN_MS = 30 * 24 * 60 * 60 * 1000

interface PersistentStorageState {
  /**
   * True if the browser keeps the website storage until the user deletes it. `null` if the browser has no Storage API,
   * `undefined` before the first check.
   */
  persisted: boolean | null | undefined
}

export const usePersistentStorage = create<PersistentStorageState>(() => ({ persisted: undefined }))

function storageManager(): StorageManager | null {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
  return typeof storage?.persist === 'function' && typeof storage.persisted === 'function' ? storage : null
}

/** Reads whether the website storage is persistent into {@link usePersistentStorage}. */
export async function checkPersistentStorage(): Promise<boolean | null> {
  const storage = storageManager()
  const persisted = storage ? await storage.persisted().catch(() => false) : null
  usePersistentStorage.setState({ persisted })
  return persisted
}

function askedRecently(now: number): boolean {
  try {
    return now - Number(localStorage.getItem(ASKED_AT_KEY)) < ASK_AGAIN_MS
  } catch {
    return true
  }
}

function rememberAsk(now: number): boolean {
  try {
    localStorage.setItem(ASKED_AT_KEY, String(now))
    return true
  } catch {
    return false
  }
}

let askedThisLoad = false

/**
 * Asks the browser to keep the diagrams of the website until the user deletes them. It asks at most once in a page
 * load and once in 30 days, and only while the diagrams are in browser storage.
 */
export async function askForPersistentStorage(now = Date.now()): Promise<void> {
  if (askedThisLoad || repository().location.kind !== 'browser') return
  askedThisLoad = true
  const storage = storageManager()
  if (!storage || (await checkPersistentStorage()) || askedRecently(now) || !rememberAsk(now)) return
  const persisted = await storage.persist().catch(() => false)
  usePersistentStorage.setState({ persisted })
}

/**
 * Calls {@link askForPersistentStorage} when the repository saves a diagram, for example after the user creates,
 * imports or changes one.
 *
 * @returns A function that stops it.
 */
export function askForPersistentStorageOnSave(): () => void {
  return repository().subscribe((event) => {
    if (event.kind === 'saved') void askForPersistentStorage()
  })
}
