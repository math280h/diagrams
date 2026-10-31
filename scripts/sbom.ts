import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import * as simpleIcons from 'simple-icons'
import type { SimpleIcon } from 'simple-icons'
import { REPOSITORY_URL, WEBSITE_ORIGIN } from '../src/desktop/constants.ts'
import { ICON_SOURCES } from './icons/sources.ts'
import {
  chromiumProjects,
  type Component,
  electronComponent,
  embeddedComponent,
  type FontMetadata,
  fontComponent,
  iconSetComponent,
  installerComponent,
  type LicensedLogo,
} from './sbom-components.ts'
import { type BundledSoftware, readNoticeText } from './third-party-licenses.ts'

export interface Bom {
  metadata: { component: Component; [field: string]: unknown }
  components: Component[]
  dependencies: { ref: string; dependsOn?: string[] }[]
  [field: string]: unknown
}

/** The facts about a desktop release that the output of `pnpm sbom` does not hold. */
export interface Release {
  /** The app version, such as `0.2.0` or `0.2.1-preview.57`. */
  version: string
  /** The git tag of the build, which the purl of the app names. */
  tag: string
  /** The packages and the programs inside packages in the licence files of the bundles. */
  bundled: readonly BundledSoftware[]
  /** The components inside packages of the SBOM of pnpm, such as programs and fonts, by `<package>@<version>`. */
  inside: Readonly<Record<string, readonly Component[]>>
  /** Electron, with the projects inside it. */
  runtime: Component
  /** electron-builder, with the code that it puts in the installers. */
  installer: Component
  /** The data that the app ships outside packages, such as icon sets. */
  data: readonly Component[]
}

const LICENCE_FILES = [
  'dist/third-party-licenses.txt',
  'dist/standalone/licenses.txt',
  'dist-electron/third-party-licenses.main.txt',
]
const ICON_DATA = 'src/canvas/icons/data'

function packageName(component: Component): string {
  return component.group ? `${component.group}/${component.name}` : component.name
}

/**
 * Turns the production SBOM of `pnpm sbom` into the SBOM of a desktop release.
 *
 * The root component becomes the app at the release version, with a `pkg:github` purl in place of the npm purl of the
 * private package. The Electron runtime and the data become dependencies of the app, and each component in
 * `release.inside` goes inside its package.
 *
 * @throws Error If a bundled package is not in the SBOM of pnpm, or `release.inside` has no component for a program
 * inside a bundled package.
 */
export function releaseSbom(bom: Bom, release: Release): Bom {
  const listed = new Set(bom.components.map((component) => `${packageName(component)}@${component.version}`))
  const missing = release.bundled.flatMap((software) =>
    'version' in software && !listed.has(`${software.name}@${software.version}`)
      ? [`${software.name}@${software.version}`]
      : [],
  )
  if (missing.length > 0) {
    throw new Error(
      `The bundles hold packages that the SBOM of pnpm does not list: ${missing.join(', ')}. ` +
        'Make each one a production dependency in package.json.',
    )
  }
  for (const software of release.bundled) {
    if (!('holder' in software)) continue
    const holder = `${software.holder.name}@${software.holder.version}`
    if (!release.inside[holder]?.some((component) => component.name === software.name)) {
      throw new Error(`The release has no component for ${software.name} in ${holder}.`)
    }
  }
  const oldRootRef = bom.metadata.component['bom-ref']
  const rootRef = `pkg:github/${new URL(REPOSITORY_URL).pathname.slice(1)}@${release.tag}`
  const added = [release.runtime, release.installer, ...release.data]
  const components = bom.components.map((component) => {
    const inside = release.inside[`${packageName(component)}@${component.version}`]
    return inside ? { ...component, components: [...(component.components ?? []), ...inside] } : component
  })
  return {
    ...bom,
    metadata: {
      ...bom.metadata,
      component: {
        ...bom.metadata.component,
        name: 'Diagrams',
        version: release.version,
        'bom-ref': rootRef,
        purl: rootRef,
        externalReferences: [
          { type: 'vcs', url: REPOSITORY_URL },
          { type: 'website', url: WEBSITE_ORIGIN },
          { type: 'issue-tracker', url: `${REPOSITORY_URL}/issues` },
        ],
      },
    },
    components: [...components, ...added],
    dependencies: [
      ...bom.dependencies.map((dependency) =>
        dependency.ref === oldRootRef
          ? { ref: rootRef, dependsOn: [...(dependency.dependsOn ?? []), ...added.map((one) => one['bom-ref']!)] }
          : dependency,
      ),
      ...added.map((one) => ({ ref: one['bom-ref']!, dependsOn: [] })),
    ],
  }
}

async function graphvizVersion(): Promise<string> {
  const { Graphviz } = await import('@hpcc-js/wasm-graphviz')
  return (await Graphviz.load()).version()
}

async function llhttpVersion(undiciVersion: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/nodejs/undici/v${undiciVersion}/deps/llhttp/include/llhttp.h`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} answered with status ${response.status}.`)
  const header = await response.text()
  const parts = ['MAJOR', 'MINOR', 'PATCH'].map(
    (part) => header.match(new RegExp(`#define LLHTTP_VERSION_${part} (\\d+)`))?.[1],
  )
  if (parts.some((part) => part === undefined)) throw new Error(`${url} has no llhttp version.`)
  return parts.join('.')
}

/**
 * Finds the version of the program in each package of `EMBEDDED_SOFTWARE` in `scripts/third-party-licenses.ts`, from
 * the version of the package.
 */
export const EMBEDDED_VERSIONS: Record<string, (holderVersion: string) => Promise<string>> = {
  '@hpcc-js/wasm-graphviz': graphvizVersion,
  undici: llhttpVersion,
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'))
}

async function programsInside(bundled: readonly BundledSoftware[]): Promise<Record<string, Component[]>> {
  const inside: Record<string, Component[]> = {}
  for (const software of bundled) {
    if (!('holder' in software)) continue
    const key = `${software.holder.name}@${software.holder.version}`
    if (inside[key]?.some((component) => component.name === software.name)) continue
    const findVersion = EMBEDDED_VERSIONS[software.holder.name]
    if (!findVersion) throw new Error(`EMBEDDED_VERSIONS in scripts/sbom.ts has no entry for ${software.holder.name}.`)
    const component = embeddedComponent(software.holder.name, await findVersion(software.holder.version))
    inside[key] = [...(inside[key] ?? []), component]
  }
  return inside
}

function fontsInside(bom: Bom): Record<string, Component[]> {
  const inside: Record<string, Component[]> = {}
  for (const component of bom.components) {
    if (!component.group?.startsWith('@fontsource')) continue
    const name = packageName(component)
    const installed = readJson(`node_modules/${name}/package.json`) as { version: string }
    if (installed.version !== component.version) {
      throw new Error(`node_modules holds ${name} ${installed.version}, but the SBOM lists ${component.version}.`)
    }
    inside[`${name}@${component.version}`] = [
      fontComponent(readJson(`node_modules/${name}/metadata.json`) as FontMetadata),
    ]
  }
  return inside
}

function electronRuntime(): Component {
  const binary = createRequire(import.meta.url)('electron') as string
  const versions = JSON.parse(
    execFileSync(binary, ['-p', 'JSON.stringify(process.versions)'], {
      encoding: 'utf8',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    }),
  ) as Record<string, string>
  const licences = path.join(path.dirname(binary), 'LICENSES.chromium.html')
  const chromium = existsSync(licences) ? chromiumProjects(readFileSync(licences, 'utf8')) : []
  if (chromium.length === 0) throw new Error(`${licences} names no projects.`)
  return electronComponent(versions, chromium)
}

function iconSets(): Component[] {
  const icons = new Map(
    Object.values(simpleIcons)
      .filter((icon): icon is SimpleIcon => typeof icon === 'object' && 'slug' in icon)
      .map((icon) => [`logo:${icon.slug}`, icon]),
  )
  return ICON_SOURCES.map((source) => {
    const file = path.join(ICON_DATA, `${source.file}.json`)
    const data = readFileSync(file)
    const sha256 = createHash('sha256').update(data).digest('hex')
    const version = source.npmPackage
      ? (readJson(`node_modules/${source.npmPackage}/package.json`) as { version: string }).version
      : undefined
    const logos =
      source.file === 'logos'
        ? (JSON.parse(data.toString('utf8')) as { entries: { id: string }[] }).entries.flatMap(
            (entry): LicensedLogo[] => {
              const icon = icons.get(entry.id)
              return icon?.license ? [{ title: icon.title, source: icon.source, license: icon.license }] : []
            },
          )
        : []
    return iconSetComponent(source, { version, sha256, logos })
  })
}

async function main() {
  const [input, version, tag, output] = process.argv.slice(2)
  if (!input || !version || !tag || !output) {
    throw new Error('Usage: node scripts/sbom.ts <pnpm sbom file> <version> <tag> <output file>')
  }
  const absent = LICENCE_FILES.filter((file) => !existsSync(file))
  if (absent.length > 0) throw new Error(`Run pnpm desktop:build first. These files are missing: ${absent.join(', ')}.`)
  const bundled = LICENCE_FILES.flatMap((file) => readNoticeText(readFileSync(file, 'utf8')))
  const bom = readJson(input) as Bom
  const inside = { ...(await programsInside(bundled)) }
  for (const [key, components] of Object.entries(fontsInside(bom)))
    inside[key] = [...(inside[key] ?? []), ...components]
  const builder = createRequire(createRequire(import.meta.url).resolve('electron-builder/package.json'))
  const installer = installerComponent((builder('app-builder-lib/package.json') as { version: string }).version)
  const release = { version, tag, bundled, inside, runtime: electronRuntime(), installer, data: iconSets() }
  writeFileSync(output, `${JSON.stringify(releaseSbom(bom, release), null, 2)}\n`)
}

if (import.meta.main) await main()
