import { isDesktop } from '@/desktop/bridge'

/** Tells whether this website can keep its diagrams in a folder that the user picks. Chrome and Edge can. */
export function canOpenFolder(): boolean {
  return !isDesktop() && typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

/**
 * Tells whether this website can show a folder only to read, in a browser without folder access such as Firefox. The
 * user picks the folder with a file input.
 */
export function canFollowFolder(): boolean {
  return (
    !isDesktop() &&
    !canOpenFolder() &&
    typeof HTMLInputElement !== 'undefined' &&
    'webkitdirectory' in HTMLInputElement.prototype
  )
}
