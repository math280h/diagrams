import { createJSONStorage, type StateStorage } from 'zustand/middleware'

// Node 26 has an undefined localStorage when it starts without --localstorage-file.
// A browser throws a SecurityError when the user blocks site data, and a QuotaExceededError when the storage is full.
function orFallback<T>(read: () => T, fallback: T): T {
  try {
    return read()
  } catch {
    return fallback
  }
}

/**
 * Reads and writes `localStorage` and never throws. Where `localStorage` is missing or blocked, a read gives `null`. A
 * write that fails does nothing.
 */
export const safeLocalStorage = {
  getItem: (name: string): string | null => orFallback(() => localStorage.getItem(name), null),
  setItem: (name: string, value: string): void => orFallback(() => localStorage.setItem(name, value), undefined),
  removeItem: (name: string): void => orFallback(() => localStorage.removeItem(name), undefined),
} satisfies StateStorage

/**
 * Returns the storage in `localStorage` for a persisted zustand store. Where `localStorage` is missing, blocked or full,
 * the store keeps its state in memory only.
 */
export function localPersistStorage<S>() {
  return createJSONStorage<S>(() => safeLocalStorage)
}
