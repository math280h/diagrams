import type { ThemeSource } from '@/desktop/contract'
import { MAX_THEME_FILE_BYTES, MAX_THEME_FILES, THEME_FILE_SUFFIX, THEMES_FOLDER } from '@/themes/tokens'
import { writeText } from './folder-files'

function isNotFound(error: unknown) {
  return error instanceof DOMException && error.name === 'NotFoundError'
}

/** Returns the theme files in the `themes` folder of a folder, or no files when it has no such folder. */
export async function readFolderThemes(root: FileSystemDirectoryHandle): Promise<ThemeSource[]> {
  let folder: FileSystemDirectoryHandle
  try {
    folder = await root.getDirectoryHandle(THEMES_FOLDER)
  } catch (error) {
    if (isNotFound(error)) return []
    throw error
  }
  const sources: ThemeSource[] = []
  for await (const [name, handle] of folder.entries()) {
    if (sources.length >= MAX_THEME_FILES) break
    if (handle.kind !== 'file' || !name.endsWith(THEME_FILE_SUFFIX)) continue
    const file = await handle.getFile()
    if (file.size > MAX_THEME_FILE_BYTES) continue
    sources.push({ name: name.slice(0, -THEME_FILE_SUFFIX.length), text: await file.text() })
  }
  return sources
}

/**
 * Writes a new theme file in the `themes` folder of a folder.
 *
 * @throws Error If a theme file with this name exists.
 */
export async function writeFolderTheme(root: FileSystemDirectoryHandle, { name, text }: ThemeSource) {
  const folder = await root.getDirectoryHandle(THEMES_FOLDER, { create: true })
  const fileName = `${name}${THEME_FILE_SUFFIX}`
  try {
    await folder.getFileHandle(fileName)
    throw new Error(`The themes folder has a file ${fileName} already.`)
  } catch (error) {
    if (!isNotFound(error)) throw error
  }
  await writeText(folder, fileName, text)
}
