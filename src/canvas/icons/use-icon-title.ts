import { useSyncExternalStore } from 'react'
import { subscribe } from '@/canvas/icon-cache'
import { iconEntry } from './library'

/** Returns the display name of an icon: the product name of a set icon, or the Lucide name. */
export function useIconTitle(name: string): string {
  return useSyncExternalStore(subscribe, () => iconEntry(name)?.title ?? name)
}
