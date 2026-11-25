import { createJSONStorage, type StateStorage } from 'zustand/middleware'

function orFallback<T>(read: () => T, fallback: T): T {
  try {
    return read()
  } catch {
    return fallback
  }
}

// Node 26 has an undefined localStorage when it starts without --localstorage-file.
// A browser throws a SecurityError when the user blocks site data, and a QuotaExceededError when the storage is full.
const localStateStorage: StateStorage = {
  getItem: (name) => orFallback(() => localStorage.getItem(name), null),
  setItem: (name, value) => orFallback(() => localStorage.setItem(name, value), undefined),
  removeItem: (name) => orFallback(() => localStorage.removeItem(name), undefined),
}

/**
 * Returns the storage in `localStorage` for a persisted zustand store. Where `localStorage` is missing, blocked or full,
 * the store keeps its state in memory only.
 */
export function localPersistStorage<S>() {
  return createJSONStorage<S>(() => localStateStorage)
}
