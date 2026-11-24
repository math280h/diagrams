import { create } from 'zustand'
import { repository } from './active-repository'

const ASKED_AT_KEY = 'dg:persist-asked-at'
const ASK_AGAIN_MS = 24 * 60 * 60 * 1000

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
    const askedAt = localStorage.getItem(ASKED_AT_KEY)
    return askedAt !== null && now - Number(askedAt) < ASK_AGAIN_MS
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

let asking = false

/**
 * Asks the browser to keep the diagrams of the website until the user deletes them, while the diagrams are in browser
 * storage and the storage is not persistent. After a request, it asks again only when one day has passed.
 */
export async function askForPersistentStorage(now = Date.now()): Promise<void> {
  const storage = storageManager()
  if (!storage || asking || repository().location.kind !== 'browser' || askedRecently(now)) return
  asking = true
  try {
    if ((await checkPersistentStorage()) || !rememberAsk(now)) return
    const persisted = await storage.persist().catch(() => false)
    usePersistentStorage.setState({ persisted })
  } finally {
    asking = false
  }
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
