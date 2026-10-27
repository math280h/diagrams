import type { LucideIconData } from 'lucide-react'
import type { IconArt, IconEntry, IconSourceId } from '@/canvas/icons/library'

/** The ids of the JSON script elements in an exported page. */
export const PAGE_DATA_IDS = { diagram: 'dg-diagram', icons: 'dg-icons' } as const

/** The icons of an exported page: subsets of the icon sets, and the Lucide icons outside the player bundle. */
export interface PageIcons {
  sets: { source: IconSourceId; entries: IconEntry[]; art: Record<string, IconArt> }[]
  lucide: Record<string, LucideIconData>
}
