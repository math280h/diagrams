import { randomBytes } from 'node:crypto'

const TEMP_MARK = '.tmp-'
const TEMP_TAIL = /^\.tmp-[0-9a-f]{8}$/

/** The minimum time since the last change of a temporary file before the store removes it as left behind. */
export const STALE_TEMP_AGE_MS = 60 * 60 * 1000

/** Returns a new temporary file name next to a file: the file name, `.tmp-` and 8 random hex digits. */
export function tempFileOf(file: string) {
  return `${file}${TEMP_MARK}${randomBytes(4).toString('hex')}`
}

/**
 * Returns the name of the file that a temporary file of this store is for.
 *
 * @returns The target name, or `null` if the name does not have the form that {@link tempFileOf} gives.
 */
export function targetOfTempName(name: string): string | null {
  const index = name.lastIndexOf(TEMP_MARK)
  if (index <= 0 || !TEMP_TAIL.test(name.slice(index))) return null
  return name.slice(0, index)
}
