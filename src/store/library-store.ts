import { create } from 'zustand'
import { repository } from '@/persistence/active-repository'
import type { DiagramMeta } from '@/persistence/repository'

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

/** Loads the diagram list and updates it when storage changes. Call it after {@link setRepository}. */
export function startLibrary() {
  stopLibrary?.()
  useLibrary.getState().refresh()
  stopLibrary = repository().subscribe((event) => {
    if (event.kind === 'changed' || event.kind === 'saved' || event.kind === 'removed') useLibrary.getState().refresh()
  })
}
