import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { OFFICIAL_WEBSITE } from '../src/desktop/build-config.ts'
import { REPOSITORY_URL } from '../src/desktop/constants.ts'
import type { Component } from './sbom-components.ts'
import {
  type Bom,
  bundledOnly,
  bundledPackages,
  composeSbom,
  fontsInside,
  iconSets,
  listedPackages,
  programsInside,
} from './sbom.ts'
import { type BundledSoftware, readNoticeText } from './third-party-licenses.ts'

/** An image that a `FROM` line of a Dockerfile pins by tag and digest. */
export interface PinnedImage {
  repository: string
  tag: string
  digest: string
}

/** The facts about the website image that the output of `pnpm sbom` does not hold. */
export interface WebsiteImage {
  /** The release version, such as `0.2.0`. */
  version: string
  /** The packages and the programs inside packages in the licence files of the website bundles. */
  bundled: readonly BundledSoftware[]
  /** The components inside packages of the SBOM of pnpm, such as programs and fonts, by `<package>@<version>`. */
  inside: Readonly<Record<string, readonly Component[]>>
  /** The bundled packages that the SBOM of pnpm does not list, such as dev dependencies whose CSS ships. */
  unlisted: readonly Component[]
  /** The data that the website ships outside packages, such as icon sets. */
  data: readonly Component[]
  /** The web server of the image. */
  server: Component
  /** The base image. */
  base: Component
}

const LICENCE_FILES = ['dist/third-party-licenses.txt', 'dist/standalone/licenses.txt']
const SERVER_REPOSITORY = 'ghcr.io/static-web-server/static-web-server'
const BASE_REPOSITORIES = 'gcr.io/distroless/'
const PINNED_FROM = /^FROM (?:--platform=\S+ )?(\S+?):([^\s:@/]+)@(sha256:[0-9a-f]{64})(?:\s|$)/gm

/** Reads the images that the `FROM` lines of a Dockerfile pin by tag and digest. */
export function pinnedImages(dockerfile: string): PinnedImage[] {
  return [...dockerfile.matchAll(PINNED_FROM)].map(([, repository = '', tag = '', digest = '']) => ({
    repository,
    tag,
    digest,
  }))
}

function ociPurl(name: string, repository: string, tag: string, digest?: string): string {
  const version = digest ? `@${encodeURIComponent(digest)}` : ''
  return `pkg:oci/${name}${version}?repository_url=${repository}&tag=${tag}`
}

function findImage(images: readonly PinnedImage[], matches: (repository: string) => boolean, label: string) {
  const image = images.find((candidate) => matches(candidate.repository))
  if (!image) throw new Error(`The Dockerfile pins no ${label} image.`)
  return image
}

/**
 * Returns the component of static-web-server, from its image in the Dockerfile.
 *
 * @throws Error If the Dockerfile pins no static-web-server image.
 */
export function serverComponent(images: readonly PinnedImage[]): Component {
  const image = findImage(images, (repository) => repository === SERVER_REPOSITORY, SERVER_REPOSITORY)
  const purl = `pkg:cargo/static-web-server@${image.tag}`
  return {
    type: 'application',
    name: 'static-web-server',
    version: image.tag,
    'bom-ref': purl,
    purl,
    description: `The web server of the image, from ${image.repository}:${image.tag}@${image.digest}.`,
    licenses: [{ expression: 'MIT OR Apache-2.0' }],
    externalReferences: [
      { type: 'website', url: 'https://static-web-server.net' },
      { type: 'vcs', url: 'https://github.com/static-web-server/static-web-server' },
    ],
  }
}

/**
 * Returns the component of the distroless base image, from its image in the Dockerfile.
 *
 * @throws Error If the Dockerfile pins no distroless image.
 */
export function baseImageComponent(images: readonly PinnedImage[]): Component {
  const image = findImage(images, (repository) => repository.startsWith(BASE_REPOSITORIES), 'distroless')
  const name = image.repository.split('/').at(-1)!
  const purl = ociPurl(name, image.repository, image.tag, image.digest)
  return {
    type: 'container',
    name,
    version: image.digest,
    'bom-ref': purl,
    purl,
    description:
      `The base image, ${image.repository}:${image.tag}. The SPDX SBOM of BuildKit in each platform image lists ` +
      'its Debian packages.',
    licenses: [{ license: { id: 'Apache-2.0' } }],
    externalReferences: [{ type: 'vcs', url: 'https://github.com/GoogleContainerTools/distroless' }],
  }
}

/**
 * Turns the production SBOM of `pnpm sbom` into the SBOM of the website image.
 *
 * The SBOM keeps only the packages in the website bundles. The root component becomes the image at the release
 * version, with a `pkg:oci` purl. static-web-server, the base image, the data and the unlisted packages become
 * dependencies of the image.
 *
 * @throws Error If a bundled package, or a program inside a bundled package, has no component.
 */
export function imageSbom(bom: Bom, image: WebsiteImage): Bom {
  const repository = `ghcr.io${new URL(REPOSITORY_URL).pathname.toLowerCase()}`
  const purl = ociPurl(repository.split('/').at(-1)!, repository, image.version)
  return composeSbom(bundledOnly(bom, image.bundled), {
    ...image,
    extra: [image.server, image.base, ...image.data],
    root: {
      ...bom.metadata.component,
      type: 'container',
      name: 'Diagrams website',
      version: image.version,
      'bom-ref': purl,
      purl,
      description: 'The Diagrams website, served by static-web-server on a distroless base.',
      externalReferences: [
        { type: 'vcs', url: REPOSITORY_URL },
        { type: 'website', url: OFFICIAL_WEBSITE },
        { type: 'issue-tracker', url: `${REPOSITORY_URL}/issues` },
      ],
    },
  })
}

async function main() {
  const [input, version, output] = process.argv.slice(2)
  if (!input || !version || !output) {
    throw new Error('Usage: node scripts/image-sbom.ts <pnpm sbom file> <version> <output file>')
  }
  const absent = LICENCE_FILES.filter((file) => !existsSync(file))
  if (absent.length > 0) throw new Error(`Run pnpm build first. These files are missing: ${absent.join(', ')}.`)
  const bundled = LICENCE_FILES.flatMap((file) => readNoticeText(readFileSync(file, 'utf8')))
  const bom = JSON.parse(readFileSync(input, 'utf8')) as Bom
  const inside = await programsInside(bundled)
  for (const [key, components] of Object.entries(fontsInside(bom.components)))
    inside[key] = [...(inside[key] ?? []), ...components]
  const images = pinnedImages(readFileSync('Dockerfile', 'utf8'))
  const sbom = imageSbom(bom, {
    version,
    bundled,
    inside,
    unlisted: bundledPackages(bundled, listedPackages(bom)),
    data: iconSets(),
    server: serverComponent(images),
    base: baseImageComponent(images),
  })
  writeFileSync(output, `${JSON.stringify(sbom, null, 2)}\n`)
}

if (import.meta.main) await main()
