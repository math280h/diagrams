import { realpathSync } from 'node:fs'
import path from 'node:path'

/** Tells whether a POSIX path is the folder or a path inside it. */
export function isInsideFolder(file: string, folder: string): boolean {
  const relative = path.posix.relative(folder, file)
  return !relative.startsWith('..') && !path.posix.isAbsolute(relative)
}

function realFolder(folder: string): string {
  try {
    return realpathSync(folder)
  } catch {
    return folder
  }
}

/**
 * Returns the AppImage file that runs this process, or `null` outside an AppImage. The process must run from inside
 * `APPDIR`, so `APPIMAGE` from a parent process that is another AppImage does not count.
 */
export function runningAppImage(env: NodeJS.ProcessEnv = process.env, execPath = process.execPath): string | null {
  const { APPIMAGE: appImage, APPDIR: appDir } = env
  if (!appImage || !appDir || !path.posix.isAbsolute(appImage)) return null
  const inside = [appDir, realFolder(appDir)].some((folder) => execPath !== folder && isInsideFolder(execPath, folder))
  return inside ? appImage : null
}
