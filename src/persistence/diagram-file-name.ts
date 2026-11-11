import { DIAGRAM_FILE_SUFFIX } from '@/desktop/constants'

const MAX_ID_LENGTH = 200
const SAFE_ID = /^[\p{L}\p{N}_()-][\p{L}\p{N}_ .()-]*$/u

/** Tells whether a diagram id can be a file name on every system: no path parts, no leading dot, no trailing space. */
export function isSafeId(id: string) {
  return id.length <= MAX_ID_LENGTH && SAFE_ID.test(id) && !id.endsWith('.') && !id.endsWith(' ')
}

/**
 * Returns the diagram id of a file name.
 *
 * @returns The id, or `null` if the name is not a diagram file.
 */
export function idOfFile(name: string): string | null {
  if (!name.endsWith(DIAGRAM_FILE_SUFFIX)) return null
  const id = name.slice(0, -DIAGRAM_FILE_SUFFIX.length)
  return isSafeId(id) ? id : null
}

export function fileOfId(id: string) {
  return `${id}${DIAGRAM_FILE_SUFFIX}`
}
