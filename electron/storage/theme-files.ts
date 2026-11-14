import { existsSync, watch, type FSWatcher } from 'node:fs'
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
const RESTART_DELAY_MS = 1000

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
    /** Returns a text that changes when a theme file comes, goes or changes. Without theme files, it is empty. */
    async signature(): Promise<string> {
      let names: string[]
      try {
        names = await readdir(folder)
      } catch {
        return ''
      }
      const files = names.filter((name) => name.endsWith(THEME_FILE_SUFFIX)).toSorted()
      const parts = await Promise.all(
        files.map(async (name) => {
          try {
            const { size, mtimeMs, ctimeMs } = await stat(path.join(folder, name))
            return `${name}:${size}:${mtimeMs}:${ctimeMs}`
          } catch {
            return name
          }
        }),
      )
      return parts.join('\n')
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
 * @returns `stop`, and `rescan`, which compares the theme files with the last report and reports a change that the
 *   watchers missed.
 */
export function watchThemeFolder(themes: ThemeFiles, onChange: () => void) {
  let themeWatcher: FSWatcher | null = null
  let parentWatcher: FSWatcher | null = null
  let reportTimer: NodeJS.Timeout | undefined
  let reportDue = false
  const restartTimers = new Set<NodeJS.Timeout>()
  let stopped = false
  let reported = themes.signature()

  const changed = () => {
    if (stopped) return
    reportDue = true
    clearTimeout(reportTimer)
    reportTimer = setTimeout(() => {
      reportDue = false
      reported = themes.signature()
      void reported.then(() => {
        if (!stopped) onChange()
      })
    }, DEBOUNCE_MS)
  }

  const later = (action: () => void) => {
    if (stopped) return
    const timer = setTimeout(() => {
      restartTimers.delete(timer)
      action()
    }, RESTART_DELAY_MS)
    restartTimers.add(timer)
  }

  const rescan = async () => {
    if (stopped) return
    if (!themeWatcher) watchThemes()
    const last = reported
    const [before, now] = await Promise.all([last, themes.signature()])
    if (stopped || reportDue || last !== reported || before === now) return
    watchThemes()
    changed()
  }

  function watchThemes() {
    themeWatcher?.close()
    themeWatcher = null
    if (stopped || !existsSync(themes.folder)) return
    try {
      const next = watch(themes.folder, (_event, name) => {
        if (name === null || name.endsWith(THEME_FILE_SUFFIX)) changed()
      })
      next.on('error', () => {
        next.close()
        if (themeWatcher !== next) return
        themeWatcher = null
        changed()
        later(() => void rescan())
      })
      themeWatcher = next
    } catch {
      themeWatcher = null
    }
  }

  const restartParent = () => {
    watchParent()
    void rescan()
  }

  function watchParent() {
    if (stopped) return
    try {
      // fs.watch reports a new, removed or renamed entry as `rename`, and other changes of an entry as `change`.
      const next = watch(path.dirname(themes.folder), (event, name) => {
        if (name !== null && name !== THEMES_FOLDER) return
        if (event === 'rename' || name === null || !themeWatcher) watchThemes()
        changed()
      })
      next.on('error', () => {
        next.close()
        if (parentWatcher === next) parentWatcher = null
        later(restartParent)
      })
      parentWatcher = next
    } catch {
      later(restartParent)
    }
  }

  watchParent()
  watchThemes()

  return {
    rescan,
    stop() {
      stopped = true
      clearTimeout(reportTimer)
      for (const timer of restartTimers) clearTimeout(timer)
      restartTimers.clear()
      themeWatcher?.close()
      parentWatcher?.close()
    },
  }
}
