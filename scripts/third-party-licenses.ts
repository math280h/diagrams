import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

interface PackageJson {
  name?: string
  version?: string
  license?: string | { type?: string }
  repository?: string | { url?: string }
  homepage?: string
}

export interface PackageNotice {
  name: string
  version: string
  license: string
  source: string | null
  texts: string[]
}

const NOTICE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i

/**
 * Software that a package holds in compiled form, under its own licence, with a file that has the licence text. A
 * build fails when a bundled package holds or loads WebAssembly and has no entry here.
 */
export const EMBEDDED_SOFTWARE: Record<string, { name: string; license: string; source: string; licenseText: string }> =
  {
    '@hpcc-js/wasm-graphviz': {
      name: 'Graphviz',
      license: 'EPL-2.0',
      source: 'https://gitlab.com/graphviz/graphviz',
      licenseText: 'node_modules/elkjs/LICENSE.md',
    },
    undici: {
      name: 'llhttp',
      license: 'MIT',
      source: 'https://github.com/nodejs/llhttp',
      licenseText: 'scripts/licenses/llhttp.txt',
    },
  }
const SEPARATOR = '='.repeat(80)
const WEBASSEMBLY_API = /WebAssembly\.(?:instantiate|instantiateStreaming|compile|compileStreaming|Module)\b/
// A WebAssembly module starts with the bytes "\0asm", which are "AGFzbQ" in base64.
const WEBASSEMBLY_BASE64_LITERAL = /["'`]AGFzbQ/

/** A package in a build, or a program inside a package of the build. */
export type BundledSoftware =
  | { name: string; version: string }
  | { name: string; holder: { name: string; version: string } }

const NOTICE_HEADER = /^(\S+) (?:in (\S+) (\S+)|(\S+))$/

const STYLE_SHEET_IMPORT = /@(?:import|plugin)\s+(?:url\(\s*)?['"]([^'"]+)['"]/g

/**
 * Returns the packages that a style sheet imports with `@import` or `@plugin`.
 */
export function styleSheetImports(css: string): string[] {
  const names = new Set<string>()
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(STYLE_SHEET_IMPORT)) {
    const specifier = match[1]!
    if (/^(?:\.|\/|[a-z][a-z\d+.-]*:)/i.test(specifier)) continue
    const parts = specifier.split('/')
    names.add(specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!)
  }
  return [...names]
}

function installedPackage(name: string, fromDirectory: string): string | null {
  for (let directory = fromDirectory; ; directory = path.dirname(directory)) {
    const root = path.join(directory, 'node_modules', name)
    if (existsSync(path.join(root, 'package.json'))) return realpathSync(root)
    if (path.dirname(directory) === directory) return null
  }
}

function styleSheetPackages(moduleId: string): string[] {
  const file = moduleId.replace(/^\0/, '').split('?')[0]!
  if (!file.endsWith('.css') || !existsSync(file)) return []
  return styleSheetImports(readFileSync(file, 'utf8')).flatMap(
    (name) => installedPackage(name, path.dirname(file)) ?? [],
  )
}

function packageRoot(moduleId: string): string | null {
  const file = moduleId.replace(/^\0/, '').split('?')[0]!.replaceAll('\\', '/')
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

function embeddedNotices(notice: PackageNotice): PackageNotice[] {
  const embedded = EMBEDDED_SOFTWARE[notice.name]
  if (!embedded) return []
  const file = path.resolve(embedded.licenseText)
  return [
    {
      name: embedded.name,
      version: `in ${notice.name} ${notice.version}`,
      license: embedded.license,
      source: embedded.source,
      texts: existsSync(file) ? [readFileSync(file, 'utf8').trim()] : [],
    },
  ]
}

/** Writes the name, version, licence, source and licence texts of each package as one text. */
export function noticeText(notices: readonly PackageNotice[]): string {
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

/** Reads the packages and the programs inside packages back from the text that {@link noticeText} writes. */
export function readNoticeText(text: string): BundledSoftware[] {
  const lines = text.split('\n')
  return lines.flatMap((line, index): BundledSoftware[] => {
    if (line !== SEPARATOR || !lines[index + 2]?.startsWith('Licence: ')) return []
    const match = lines[index + 1]?.match(NOTICE_HEADER)
    if (!match) return []
    const [, name = '', holderName, holderVersion, version] = match
    if (holderName && holderVersion) return [{ name, holder: { name: holderName, version: holderVersion } }]
    return version ? [{ name, version }] : []
  })
}

/**
 * Creates a Vite plugin for a build that ships no licence file. The plugin fails the build when the build bundles a
 * package.
 */
export function withoutPackages(): Plugin {
  return {
    name: 'without-packages',
    apply: 'build',
    generateBundle() {
      const roots = new Set([...this.getModuleIds()].flatMap((id) => packageRoot(id) ?? []))
      const names = [...roots].map((root) => readNotice(root)?.name ?? root)
      if (names.length > 0)
        this.error(`This build ships no licence file, but it bundles packages: ${names.join(', ')}.`)
    },
  }
}

/**
 * Creates Vite plugins that collect the bundled packages of a build and its worker builds. The main plugin writes the
 * name, version, licence, source and licence files of each package to one text asset. It fails the build when a
 * bundled package holds or loads WebAssembly and {@link EMBEDDED_SOFTWARE} has no entry for it.
 *
 * @param fileName - The path of the asset in the build output.
 */
export function thirdPartyLicenses(fileName = 'third-party-licenses.txt'): { main: Plugin; worker: () => Plugin } {
  const roots = new Set<string>()
  const webAssemblyRoots = new Set<string>()
  const collect = (moduleIds: Iterable<string>, codeOf: (id: string) => string | null | undefined) => {
    for (const id of moduleIds) {
      const root = packageRoot(id)
      if (!root) {
        for (const imported of styleSheetPackages(id)) roots.add(imported)
        continue
      }
      roots.add(root)
      const code = codeOf(id) ?? ''
      if (id.split('?')[0]!.endsWith('.wasm') || WEBASSEMBLY_API.test(code) || WEBASSEMBLY_BASE64_LITERAL.test(code)) {
        webAssemblyRoots.add(root)
      }
    }
  }
  return {
    main: {
      name: 'third-party-licenses',
      apply: 'build',
      generateBundle() {
        collect(this.getModuleIds(), (id) => this.getModuleInfo(id)?.code)
        const unlisted = [...webAssemblyRoots].flatMap((root) => {
          const name = readNotice(root)?.name
          return name && !EMBEDDED_SOFTWARE[name] ? [name] : []
        })
        if (unlisted.length > 0) {
          this.error(
            `These packages hold or load WebAssembly: ${unlisted.join(', ')}. Add the program in each one to EMBEDDED_SOFTWARE in scripts/third-party-licenses.ts.`,
          )
        }
        const notices = new Map<string, PackageNotice>()
        for (const root of roots) {
          const notice = readNotice(root)
          if (!notice) continue
          for (const found of [notice, ...embeddedNotices(notice)]) notices.set(`${found.name}@${found.version}`, found)
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
        collect(this.getModuleIds(), (id) => this.getModuleInfo(id)?.code)
      },
    }),
  }
}
