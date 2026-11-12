import { desktopApi } from '@/desktop/bridge'
import type { ThemeSource } from '@/desktop/contract'
import { folderSession } from '@/folder/folder-store'
import { readFolderThemes, writeFolderTheme } from '@/folder/folder-themes'
import { setThemeFiles, useThemeStore } from './store'

const IMPORTED_THEMES_KEY = 'dg:themes'

function isSource(value: unknown): value is ThemeSource {
  const source = value as Partial<ThemeSource> | null
  return typeof source?.name === 'string' && typeof source.text === 'string'
}

function readImportedThemes(): ThemeSource[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(IMPORTED_THEMES_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter(isSource) : []
  } catch {
    return []
  }
}

function saveImportedThemes(sources: readonly ThemeSource[]) {
  localStorage.setItem(IMPORTED_THEMES_KEY, JSON.stringify(sources))
  setThemeFiles('browser', sources)
}

let reloadFolder: (() => Promise<void>) | null = null

/** Loads the theme files of the user and follows their changes. Call it before the app renders. */
export async function startThemeFiles() {
  const desktop = desktopApi()
  if (desktop) {
    desktop.on('themes.changed', (sources) => setThemeFiles('desktop', sources))
    setThemeFiles('desktop', await desktop.request('themes.list', null).catch(() => []))
    return
  }
  const session = folderSession()
  if (session) {
    reloadFolder = () =>
      readFolderThemes(session.folder).then(
        (sources) => setThemeFiles('folder', sources),
        () => undefined,
      )
    session.onThemes(() => void reloadFolder?.())
    await reloadFolder()
    return
  }
  setThemeFiles('browser', readImportedThemes())
}

/**
 * Adds a theme file: in the `themes` folder of the diagrams folder, or in this browser when the website has no folder.
 *
 * @throws Error If the file cannot be written, for example because a file with this name exists.
 */
export async function addThemeFile(source: ThemeSource) {
  const place = useThemeStore.getState().place
  const desktop = desktopApi()
  if (place === 'desktop' && desktop) {
    await desktop.request('themes.write', source)
    setThemeFiles('desktop', await desktop.request('themes.list', null))
    return
  }
  const session = folderSession()
  if (place === 'folder' && session) {
    await writeFolderTheme(session.folder, source)
    await reloadFolder?.()
    return
  }
  saveImportedThemes([...readImportedThemes().filter((theme) => theme.name !== source.name), source])
}

/** Removes a theme that the user imported into this browser. */
export function removeImportedTheme(name: string) {
  saveImportedThemes(readImportedThemes().filter((theme) => theme.name !== name))
}

/** Shows the `themes` folder of the desktop app in the file manager. */
export async function revealThemeFolder() {
  await desktopApi()?.request('themes.reveal', null)
}
