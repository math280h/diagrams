import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

interface PackageJson {
  name?: string
  version?: string
  license?: string | { type?: string }
  repository?: string | { url?: string }
  homepage?: string
}

interface PackageNotice {
  name: string
  version: string
  license: string
  source: string | null
  texts: string[]
}

const NOTICE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i
const SEPARATOR = '='.repeat(80)

function packageRoot(moduleId: string): string | null {
  const file = moduleId.replace(/^\0/, '').split('?')[0].replaceAll('\\', '/')
  const marker = file.lastIndexOf('/node_modules/')
  if (marker === -1) return null
  const rest = file.slice(marker + '/node_modules/'.length).split('/')
  const nameParts = rest[0]?.startsWith('@') ? rest.slice(0, 2) : rest.slice(0, 1)
  return [file.slice(0, marker), 'node_modules', ...nameParts].join('/')
}

function sourceUrl(manifest: PackageJson): string | null {
  const repository = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url
  if (!repository) return manifest.homepage ?? null
  if (/^[\w.-]+\/[\w.-]+$/.test(repository)) return `https://github.com/${repository}`
  return repository
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/^github:/, 'https://github.com/')
    .replace(/\.git$/, '')
}

function readNotice(root: string): PackageNotice | null {
  const manifestPath = path.join(root, 'package.json')
  if (!existsSync(manifestPath)) return null
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageJson
  if (!manifest.name || !manifest.version) return null
  const license =
    typeof manifest.license === 'string' ? manifest.license : (manifest.license?.type ?? 'See the licence text')
  const texts = readdirSync(root)
    .filter((file) => NOTICE_FILE.test(file))
    .toSorted()
    .map((file) => readFileSync(path.join(root, file), 'utf8').trim())
  return { name: manifest.name, version: manifest.version, license, source: sourceUrl(manifest), texts }
}

function noticeText(notices: readonly PackageNotice[]): string {
  const sections = notices.map((notice) =>
    [
      SEPARATOR,
      `${notice.name} ${notice.version}`,
      `Licence: ${notice.license}`,
      ...(notice.source ? [`Source: ${notice.source}`] : []),
      '',
      ...(notice.texts.length > 0 ? notice.texts : ['The package has no licence file. Its licence is named above.']),
    ].join('\n'),
  )
  return [
    'Third-party software in this build',
    '',
    'This build includes the packages below. Each package keeps its own licence.',
    'THIRD-PARTY-NOTICES.md in the source repository lists the icons and logos and their terms.',
    '',
    ...sections,
    '',
  ].join('\n')
}

/**
 * Creates Vite plugins that collect the bundled packages of a build and its worker builds. The main plugin writes the
 * name, version, licence, source and licence files of each package to one text asset.
 *
 * @param fileName - The path of the asset in the build output.
 */
export function thirdPartyLicenses(fileName = 'third-party-licenses.txt'): { main: Plugin; worker: () => Plugin } {
  const roots = new Set<string>()
  const collect = (moduleIds: Iterable<string>) => {
    for (const id of moduleIds) {
      const root = packageRoot(id)
      if (root) roots.add(root)
    }
  }
  return {
    main: {
      name: 'third-party-licenses',
      apply: 'build',
      generateBundle() {
        collect(this.getModuleIds())
        const notices = new Map<string, PackageNotice>()
        for (const root of roots) {
          const notice = readNotice(root)
          if (notice) notices.set(`${notice.name}@${notice.version}`, notice)
        }
        const sorted = [...notices.values()].toSorted(
          (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
        )
        this.emitFile({ type: 'asset', fileName, source: noticeText(sorted) })
      },
    },
    worker: () => ({
      name: 'third-party-licenses:worker',
      apply: 'build',
      generateBundle() {
        collect(this.getModuleIds())
      },
    }),
  }
}
