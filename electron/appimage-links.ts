import { execFile } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { APPIMAGE_LINK_ENTRY, DEEP_LINK_SCHEME } from '@/desktop/constants'
import { isInsideFolder, runningAppImage } from './appimage'
import { entryProgram, entryValues, execValue, stringValue } from './desktop-entry'
import { APP_NAME } from './paths'

export const LINK_MIME_TYPE = `x-scheme-handler/${DEEP_LINK_SCHEME}`
const ENTRY_MODE = 0o644
const COMMAND_TIMEOUT_MS = 10_000
const DEFAULT_DATA_DIRS = ['/usr/local/share', '/usr/share']
const APPIMAGE_FOLDER_VARIABLES = ['PATH', 'LD_LIBRARY_PATH', 'XDG_DATA_DIRS', 'GSETTINGS_SCHEMA_DIR'] as const
const MAX_ENTRY_ID_PARTS = 6
const NO_SANDBOX_ARG = '--no-sandbox'

/** The app that opens {@link DEEP_LINK_SCHEME} links now, as `xdg-mime query default` tells it. */
export type LinkHandler =
  | { kind: 'unknown' }
  | { kind: 'none' }
  | { kind: 'own' }
  | {
      kind: 'other'
      /** False if the system cannot find the desktop entry, or if the program of the entry is gone. */
      works: boolean
    }

export interface LinkPlan {
  /** Writes the entry {@link APPIMAGE_LINK_ENTRY} for this AppImage. */
  write: boolean
  /** Makes the entry the default handler of {@link LINK_MIME_TYPE} with `xdg-mime default`. */
  makeDefault: boolean
}

export interface LinkSystem {
  /** The folders with desktop entries, in the order of the XDG data folders. The first is the folder of the user. */
  entryFolders: readonly string[]
  /** The folders where the system finds a program without a path, as in `PATH`. */
  programFolders: readonly string[]
  /**
   * Runs a program of the system.
   *
   * @returns The standard output.
   * @throws Error If the program is missing or fails.
   */
  run(program: string, args: readonly string[]): Promise<string>
}

/** Returns the environment of the system programs: the variables without the folders of the AppImage. */
export function hostEnvironment(env: NodeJS.ProcessEnv, appDir: string): NodeJS.ProcessEnv {
  const host = { ...env }
  for (const name of APPIMAGE_FOLDER_VARIABLES) {
    const folders = (env[name] ?? '').split(':').filter((folder) => folder !== '' && !isInsideFolder(folder, appDir))
    if (folders.length > 0) host[name] = folders.join(':')
    else delete host[name]
  }
  return host
}

function absoluteFolders(list: string | undefined): string[] {
  return (list ?? '').split(':').filter((folder) => path.posix.isAbsolute(folder))
}

/** Returns the folders of the XDG Base Directory Specification for the environment, and a way to run programs. */
export function linkSystem(env: NodeJS.ProcessEnv, home: string, run: LinkSystem['run']): LinkSystem {
  const dataHome = absoluteFolders(env.XDG_DATA_HOME)[0] ?? path.posix.join(home, '.local', 'share')
  const dataDirs = absoluteFolders(env.XDG_DATA_DIRS)
  return {
    entryFolders: [dataHome, ...(dataDirs.length > 0 ? dataDirs : DEFAULT_DATA_DIRS)].map((folder) =>
      path.posix.join(folder, 'applications'),
    ),
    programFolders: absoluteFolders(env.PATH),
    run,
  }
}

/** Returns the command that starts the AppImage for a link, with `--no-sandbox` if this start has it. */
export function linkCommand(appImage: string, argv: readonly string[]): string[] {
  return [appImage, ...(argv.includes(NO_SANDBOX_ARG) ? [NO_SANDBOX_ARG] : [])]
}

/** Returns the text of the desktop entry that opens {@link DEEP_LINK_SCHEME} links with the command. */
export function linkEntry(command: readonly string[]): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${APP_NAME} (AppImage)`,
    `TryExec=${stringValue(command[0] ?? '')}`,
    `Exec=${execValue(command)} %U`,
    'Terminal=false',
    'NoDisplay=true',
    `MimeType=${LINK_MIME_TYPE};`,
    '',
  ].join('\n')
}

/**
 * Decides which changes the AppImage makes. It replaces no handler that works, for example the deb package of the app.
 * It takes the links when no app has them, or when the handler is gone. An entry that exists gets the current path.
 *
 * @param current - The text of the entry {@link APPIMAGE_LINK_ENTRY} now, or `null` if it does not exist.
 * @param wanted - The text of the entry for this AppImage.
 */
export function linkPlan(handler: LinkHandler, current: string | null, wanted: string): LinkPlan {
  const changed = current !== wanted
  if (handler.kind === 'unknown' || (handler.kind === 'other' && handler.works)) {
    return { write: current !== null && changed, makeDefault: false }
  }
  return { write: changed, makeDefault: handler.kind !== 'own' }
}

// The Desktop Entry Specification gives the ID `a-b.desktop` to the file `applications/a/b.desktop`.
function entryPaths(id: string): string[] {
  const [first = '', ...rest] = id.split('-')
  if (rest.length >= MAX_ENTRY_ID_PARTS) return [id]
  return rest.reduce((paths, part) => paths.flatMap((start) => [`${start}-${part}`, `${start}/${part}`]), [first])
}

function readEntry(file: string): string | null {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function findEntry(id: string, folders: readonly string[]): string | null {
  if (path.isAbsolute(id)) return readEntry(id)
  for (const folder of folders) {
    for (const relative of entryPaths(id)) {
      const text = readEntry(path.join(folder, relative))
      if (text !== null) return text
    }
  }
  return null
}

function programExists(program: string, folders: readonly string[]): boolean {
  if (path.isAbsolute(program)) return existsSync(program)
  return folders.some((folder) => existsSync(path.join(folder, program)))
}

/** Asks `xdg-mime` for the handler of {@link LINK_MIME_TYPE}, and checks that the handler can start. */
export async function currentHandler(system: LinkSystem): Promise<LinkHandler> {
  let answer: string
  try {
    answer = await system.run('xdg-mime', ['query', 'default', LINK_MIME_TYPE])
  } catch {
    return { kind: 'unknown' }
  }
  const id = answer.split('\n', 1)[0]?.trim() ?? ''
  if (id === '') return { kind: 'none' }
  if (id === APPIMAGE_LINK_ENTRY) return { kind: 'own' }
  const text = findEntry(id, system.entryFolders)
  if (text === null || entryValues(text).get('Hidden') === 'true') return { kind: 'other', works: false }
  const program = entryProgram(text)
  return { kind: 'other', works: program !== null && programExists(program, system.programFolders) }
}

/**
 * Writes the entry {@link APPIMAGE_LINK_ENTRY} into the folder of the user and makes it the handler of
 * {@link DEEP_LINK_SCHEME} links, as {@link linkPlan} decides.
 *
 * @param command - The command that starts the AppImage, from {@link linkCommand}.
 * @returns What the function changed.
 * @throws Error If the command has a line break, or if the entry cannot be written.
 */
export async function updateLinkEntry(command: readonly string[], system: LinkSystem): Promise<LinkPlan> {
  const folder = system.entryFolders[0]
  if (!folder) throw new Error('The system has no folder for desktop entries.')
  const file = path.join(folder, APPIMAGE_LINK_ENTRY)
  const wanted = linkEntry(command)
  const current = await readFile(file, 'utf8').catch(() => null)
  const plan = linkPlan(await currentHandler(system), current, wanted)
  if (plan.write) {
    await mkdir(folder, { recursive: true })
    await writeFile(file, wanted, { mode: ENTRY_MODE })
    await system.run('update-desktop-database', [folder]).catch(() => '')
  }
  if (plan.makeDefault) await system.run('xdg-mime', ['default', APPIMAGE_LINK_ENTRY, LINK_MIME_TYPE])
  return plan
}

/**
 * Writes the command into the entry {@link APPIMAGE_LINK_ENTRY} of the folder, synchronously, if the entry exists.
 *
 * @returns True if the function wrote the entry.
 * @throws Error If the command has a line break, or if the entry cannot be written.
 */
export function moveLinkEntry(command: readonly string[], folder: string): boolean {
  const file = path.join(folder, APPIMAGE_LINK_ENTRY)
  const current = readEntry(file)
  const wanted = linkEntry(command)
  if (current === null || current === wanted) return false
  writeFileSync(file, wanted, { mode: ENTRY_MODE })
  return true
}

function currentLinkSystem(): { appImage: string; system: LinkSystem } | null {
  const appImage = runningAppImage()
  const appDir = process.env.APPDIR
  if (!appImage || !appDir) return null
  const env = hostEnvironment(process.env, appDir)
  const run = promisify(execFile)
  const system = linkSystem(env, homedir(), async (program, args) => {
    const { stdout } = await run(program, args, { env, timeout: COMMAND_TIMEOUT_MS })
    return stdout
  })
  return { appImage, system }
}

/**
 * Lets {@link DEEP_LINK_SCHEME} links open the AppImage that runs this process. Each start writes the current path of
 * the AppImage. Outside an AppImage, the function does nothing.
 *
 * @returns What the function changed, or `null` outside an AppImage.
 */
export async function registerAppImageLinks(): Promise<LinkPlan | null> {
  const current = currentLinkSystem()
  if (!current) return null
  return updateLinkEntry(linkCommand(current.appImage, process.argv), current.system)
}

/**
 * Writes the new path of the AppImage into the entry {@link APPIMAGE_LINK_ENTRY}, synchronously, after an update gives
 * the AppImage a new file name. Without the entry or outside an AppImage, the function does nothing.
 */
export function appImageLinksMoved(appImage: string): void {
  const folder = currentLinkSystem()?.system.entryFolders[0]
  if (!folder) return
  try {
    moveLinkEntry(linkCommand(appImage, process.argv), folder)
  } catch {
    return
  }
}
