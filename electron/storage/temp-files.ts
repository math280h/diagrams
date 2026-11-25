import { randomBytes } from 'node:crypto'
import { lstat, readdir, rm } from 'node:fs/promises'
import path from 'node:path'

const TEMP_MARK = '.tmp-'
const TEMP_TAIL = /^\.tmp-[0-9a-f]{8}$/

/** The minimum time since the last change of a temporary file before the app removes it as left behind. */
export const STALE_TEMP_AGE_MS = 60 * 60 * 1000

/** Returns a new temporary file name next to a file: the file name, `.tmp-` and 8 random hex digits. */
export function tempFileOf(file: string) {
  return `${file}${TEMP_MARK}${randomBytes(4).toString('hex')}`
}

/**
 * Returns the name of the file that a temporary file of this app is for.
 *
 * @returns The target name, or `null` if the name does not have the form that {@link tempFileOf} gives.
 */
export function targetOfTempName(name: string): string | null {
  const index = name.lastIndexOf(TEMP_MARK)
  if (index <= 0 || !TEMP_TAIL.test(name.slice(index))) return null
  return name.slice(0, index)
}

/**
 * Writes a file through a new temporary file next to it. If `write` fails, it removes the temporary file and throws
 * the error of `write`. A failed removal does not change that error.
 *
 * @param write - Writes the temporary file and then moves it to the file.
 */
export async function writeThroughTemp(file: string, write: (temp: string) => Promise<void>) {
  const temp = tempFileOf(file)
  try {
    await write(temp)
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined)
    throw error
  }
}

/**
 * Removes the temporary files of this app that are older than {@link STALE_TEMP_AGE_MS}. It removes only regular files
 * with a name from {@link tempFileOf} whose target name `isTarget` accepts. It ignores each file that it cannot remove.
 *
 * @param names - The names of the entries in `folder`.
 * @returns The names of the removed files.
 */
export async function removeStaleTempFiles(
  folder: string,
  names: readonly string[],
  isTarget: (name: string) => boolean,
  nowMs = Date.now(),
): Promise<string[]> {
  const candidates = names.filter((name) => {
    const target = targetOfTempName(name)
    return target !== null && isTarget(target)
  })
  const removed = await Promise.all(
    candidates.map(async (name) => {
      const file = path.join(folder, name)
      try {
        const info = await lstat(file)
        if (!info.isFile() || nowMs - info.mtimeMs < STALE_TEMP_AGE_MS) return null
        await rm(file, { force: true })
        return name
      } catch {
        return null
      }
    }),
  )
  return removed.filter((name): name is string => name !== null)
}

/** Removes the old temporary files of this app that belong to the given files. See {@link removeStaleTempFiles}. */
export async function removeStaleTempFilesOf(files: readonly string[], nowMs = Date.now()) {
  const namesOf = new Map<string, Set<string>>()
  for (const file of files) {
    const folder = path.dirname(file)
    const names = namesOf.get(folder) ?? new Set()
    names.add(path.basename(file))
    namesOf.set(folder, names)
  }
  await Promise.all(
    [...namesOf].map(async ([folder, targets]) => {
      let names: string[]
      try {
        names = await readdir(folder)
      } catch {
        return
      }
      await removeStaleTempFiles(folder, names, (name) => targets.has(name), nowMs)
    }),
  )
}
