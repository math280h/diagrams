import { isDesktop } from '@/desktop/bridge'

/** Tells whether this website can keep its diagrams in a folder that the user picks. Chrome and Edge can. */
export function canOpenFolder(): boolean {
  return !isDesktop() && typeof window !== 'undefined' && 'showDirectoryPicker' in window
}
