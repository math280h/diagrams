import { create } from 'zustand'
import { repository } from '@/persistence/active-repository'
import type { DiagramMeta, RepositoryEvent } from '@/persistence/repository'

interface LibraryState {
  items: DiagramMeta[]
  usageBytes: number
  refresh: () => void
}

export const useLibrary = create<LibraryState>((set) => ({
  items: [],
  usageBytes: 0,
  refresh: () => set({ items: repository().list(), usageBytes: repository().usageBytes() }),
}))

let stopLibrary: (() => void) | null = null

const LIST_EVENTS = new Set<RepositoryEvent['kind']>(['changed', 'saved', 'removed', 'remove-failed'])

/** Loads the diagram list and updates it when storage changes. Call it after {@link setRepository}. */
export function startLibrary() {
  stopLibrary?.()
  useLibrary.getState().refresh()
  stopLibrary = repository().subscribe((event) => {
    if (LIST_EVENTS.has(event.kind)) useLibrary.getState().refresh()
  })
}
