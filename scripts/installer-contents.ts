import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runtimeSha256 } from './appimage.ts'
import {
  APPIMAGE_LIBRARIES,
  APPIMAGE_RUNTIME_SHA256,
  type InstallerFile,
  NSIS_OWN_PLUGINS,
  NSIS_PLUGINS,
} from './sbom-components.ts'

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Returns the differences between the files of a built installer and the files that the SBOM lists. A found file
 * matches a listed file with the same SHA-256, so a copy under a link name also matches.
 *
 * @param known - The names of found files that the SBOM includes in a larger component, without a hash.
 */
export function differences(
  found: readonly InstallerFile[],
  listed: readonly InstallerFile[],
  known: readonly string[] = [],
): string[] {
  const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  const problems: string[] = []
  for (const file of found) {
    if (known.some((name) => sameName(name, file.name))) continue
    if (listed.some((entry) => entry.sha256 === file.sha256)) continue
    const entry = listed.find((candidate) => sameName(candidate.name, file.name))
    problems.push(
      entry
        ? `${file.name} has the SHA-256 ${file.sha256}, but the SBOM gives ${entry.sha256}.`
        : `The installer holds ${file.name}, but the SBOM does not list it.`,
    )
  }
  for (const entry of listed) {
    if (!found.some((file) => file.sha256 === entry.sha256)) {
      problems.push(`The SBOM lists ${entry.name}, but the installer does not hold it.`)
    }
  }
  return problems
}

function filesIn(folder: string): InstallerFile[] {
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => ({ name: entry.name, sha256: sha256(readFileSync(path.join(folder, entry.name))) }))
}

function nsisProblems(executables: string[], temp: string): string[] {
  const plugins = executables.flatMap((executable) => {
    const folder = mkdtempSync(path.join(temp, 'nsis-'))
    execFileSync('7z', ['x', '-y', `-o${folder}`, executable], { stdio: 'ignore' })
    return filesIn(path.join(folder, '$PLUGINSDIR')).filter((file) => file.name.toLowerCase().endsWith('.dll'))
  })
  return differences(
    plugins,
    NSIS_PLUGINS.map((plugin) => ({ name: `${plugin.name}.dll`, sha256: plugin.sha256 })),
    NSIS_OWN_PLUGINS.map((name) => `${name}.dll`),
  )
}

function appImageProblems(appImage: string, temp: string): string[] {
  const image = readFileSync(appImage)
  const runtime = runtimeSha256(image)
  execFileSync(path.resolve(appImage), ['--appimage-extract'], { cwd: temp, stdio: 'ignore' })
  return [
    ...(runtime === APPIMAGE_RUNTIME_SHA256
      ? []
      : [`The runtime of the AppImage has the SHA-256 ${runtime}, but the SBOM gives ${APPIMAGE_RUNTIME_SHA256}.`]),
    ...differences(filesIn(path.join(temp, 'squashfs-root', 'usr', 'lib')), APPIMAGE_LIBRARIES),
  ]
}

function main() {
  const [kind, ...files] = process.argv.slice(2)
  const [first] = files
  if ((kind !== 'nsis' && kind !== 'appimage') || first === undefined) {
    throw new Error('Usage: node scripts/installer-contents.ts nsis <installer> <uninstaller> | appimage <AppImage>')
  }
  const temp = mkdtempSync(path.join(tmpdir(), 'installer-contents-'))
  try {
    const problems = kind === 'nsis' ? nsisProblems(files, temp) : appImageProblems(first, temp)
    for (const problem of problems) console.error(problem)
    if (problems.length > 0) process.exitCode = 1
    else console.log(`The SBOM lists the code that electron-builder adds to ${files.join(' and ')}.`)
  } finally {
    rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
  }
}

if (import.meta.main) main()
