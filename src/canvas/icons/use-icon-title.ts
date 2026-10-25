import { useSyncExternalStore } from 'react'
import { cacheVersion, subscribe } from '@/canvas/icon-cache'
import { iconEntry } from './library'

/** Returns the display name of an icon: the product name of a set icon, or the Lucide name. */
export function useIconTitle(name: string): string {
  useSyncExternalStore(subscribe, cacheVersion)
  return iconEntry(name)?.title ?? name
}
