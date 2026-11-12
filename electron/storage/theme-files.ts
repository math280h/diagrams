import { watch, type FSWatcher } from 'node:fs'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ThemeSource } from '@/desktop/contract'
import {
  MAX_THEME_FILE_BYTES,
  MAX_THEME_FILES,
  THEME_FILE_SUFFIX,
  THEME_NAME_PATTERN,
  THEMES_FOLDER,
} from '@/themes/tokens'

const DEBOUNCE_MS = 150

export type ThemeFiles = ReturnType<typeof createThemeFiles>

/** Reads and writes the theme files in the `themes` folder of a diagrams folder. */
export function createThemeFiles(diagramsFolder: string) {
  const folder = path.join(diagramsFolder, THEMES_FOLDER)

  async function readTheme(file: string): Promise<ThemeSource | null> {
    const full = path.join(folder, file)
    try {
      if ((await stat(full)).size > MAX_THEME_FILE_BYTES) return null
      return { name: file.slice(0, -THEME_FILE_SUFFIX.length), text: await readFile(full, 'utf8') }
    } catch {
      return null
    }
  }

  return {
    folder,
    async list(): Promise<ThemeSource[]> {
      let names: string[]
      try {
        names = await readdir(folder)
      } catch {
        return []
      }
      const files = names.filter((name) => name.endsWith(THEME_FILE_SUFFIX)).slice(0, MAX_THEME_FILES)
      return (await Promise.all(files.map(readTheme))).filter((source): source is ThemeSource => source !== null)
    },
    async write({ name, text }: ThemeSource) {
      if (!THEME_NAME_PATTERN.test(name))
        throw new Error('A theme file name has only small letters, digits and dashes.')
      await mkdir(folder, { recursive: true })
      await writeFile(path.join(folder, `${name}${THEME_FILE_SUFFIX}`), text, { flag: 'wx' })
    },
    async ensureFolder() {
      await mkdir(folder, { recursive: true })
      return folder
    },
  }
}

/**
 * Watches the `themes` folder, also when it does not exist yet, and reports each change.
 *
 * @returns A function that stops the watcher.
 */
export function watchThemeFolder(themes: ThemeFiles, onChange: () => void) {
  let timer: NodeJS.Timeout | undefined
  let themeWatcher: FSWatcher | null = null
  let parentWatcher: FSWatcher | null = null
  const changed = () => {
    clearTimeout(timer)
    timer = setTimeout(onChange, DEBOUNCE_MS)
  }
  const watchThemes = () => {
    if (themeWatcher) return
    try {
      themeWatcher = watch(themes.folder, changed)
      themeWatcher.on('error', () => {
        themeWatcher?.close()
        themeWatcher = null
        changed()
      })
    } catch {
      themeWatcher = null
    }
  }
  try {
    parentWatcher = watch(path.dirname(themes.folder), (_event, name) => {
      if (name !== null && name !== THEMES_FOLDER) return
      watchThemes()
      changed()
    })
    parentWatcher.on('error', () => {
      parentWatcher?.close()
      parentWatcher = null
    })
  } catch {
    parentWatcher = null
  }
  watchThemes()
  return () => {
    clearTimeout(timer)
    themeWatcher?.close()
    parentWatcher?.close()
  }
}
