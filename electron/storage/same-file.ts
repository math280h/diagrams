import { readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { idOfFile } from '@/persistence/diagram-file-name'

const CASE_INSENSITIVE_PLATFORMS: ReadonlySet<NodeJS.Platform> = new Set(['win32', 'darwin'])
const NO_FILE_ID = 0n

function nameKey(name: string, platform: NodeJS.Platform) {
  return CASE_INSENSITIVE_PLATFORMS.has(platform) ? name.toLowerCase() : name
}

/** Returns the absolute, normalized form of a path, in lower case on Windows and macOS. */
export function pathKey(file: string, platform: NodeJS.Platform = process.platform) {
  return nameKey(path.resolve(file), platform)
}

async function fileKeyOf(file: string): Promise<string> {
  try {
    const info = await stat(file, { bigint: true })
    if (info.ino !== NO_FILE_ID) return `id:${info.dev}:${info.ino}`
  } catch {
    return `path:${pathKey(file)}`
  }
  try {
    return `path:${pathKey(await realpath(file))}`
  } catch {
    return `path:${pathKey(file)}`
  }
}

/**
 * Tells whether two paths name one file or folder. It compares the files themselves, so other letter case, `..`,
 * symbolic links, junctions and hard links give the same file.
 */
export async function isSameFile(a: string, b: string): Promise<boolean> {
  if (pathKey(a) === pathKey(b)) return true
  const [left, right] = await Promise.all([fileKeyOf(a), fileKeyOf(b)])
  return left === right
}

/**
 * Returns one key for each file: its device and file id, or its real path when the file system gives no file id. Two
 * paths have the same key when {@link isSameFile} tells that they name one file.
 */
export function fileKeysOf(files: readonly string[]): Promise<string[]> {
  return Promise.all(files.map(fileKeyOf))
}

/**
 * Returns the id under which the diagrams folder lists each file.
 *
 * @param files - Files that exist, or new files that a write makes.
 * @returns For each file its id, or `null` if the folder does not list the file and does not list it after a write.
 */
export async function folderIdsOf(folder: string, files: readonly string[]): Promise<(string | null)[]> {
  let names: string[]
  try {
    names = await readdir(folder)
  } catch {
    return files.map(() => null)
  }
  const listed = names.flatMap((name) => {
    const id = idOfFile(name)
    return id === null ? [] : [{ name, id }]
  })
  let listedKeys: Promise<string[]> | null = null
  const idInFolder = (name: string) => {
    const key = nameKey(name, process.platform)
    const entry =
      listed.find((candidate) => candidate.name === name) ??
      listed.find((candidate) => nameKey(candidate.name, process.platform) === key)
    return entry?.id ?? idOfFile(name)
  }
  const idOfSameFile = async (target: string) => {
    listedKeys ??= fileKeysOf(listed.map((entry) => path.join(folder, entry.name)))
    const [[targetKey], keys] = await Promise.all([fileKeysOf([target]), listedKeys])
    const index = keys.indexOf(targetKey!)
    return index === -1 ? null : listed[index]!.id
  }
  return Promise.all(
    files.map(async (file) => {
      const target = path.resolve(file)
      if (await isSameFile(path.dirname(target), folder)) return idInFolder(path.basename(target))
      return idOfSameFile(target)
    }),
  )
}

/**
 * Returns the id under which the diagrams folder lists a file.
 *
 * @param file - A file that exists, or a new file that a write makes.
 * @returns The id, or `null` if the folder does not list the file and does not list it after a write.
 */
export async function folderIdOf(folder: string, file: string): Promise<string | null> {
  const [id] = await folderIdsOf(folder, [file])
  return id ?? null
}
