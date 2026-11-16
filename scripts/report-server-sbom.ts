import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { REPOSITORY_URL } from '../src/desktop/constants.ts'
import { baseImageComponent, imageRepository, ociPurl, pinnedImages } from './image-sbom.ts'
import type { Component } from './sbom-components.ts'
import { type Bom, bundledOnly, bundledPackages, composeSbom, listedPackages, programsInside } from './sbom.ts'
import { type BundledSoftware, readNoticeText } from './third-party-licenses.ts'

const LICENCE_FILE = 'report-server/dist/third-party-licenses.txt'
const DOCKERFILE = 'report-server/Dockerfile'

/** Returns the GHCR repository of the report server image of a GitHub repository. */
export function reportServerRepository(repositoryUrl: string = REPOSITORY_URL): string {
  return `${imageRepository(repositoryUrl)}-report-server`
}

/** The facts about the report server image that the output of `pnpm sbom` does not hold. */
export interface ReportServerImage {
  /** The release version, such as `0.2.0`. */
  version: string
  /** The packages and the programs inside packages in the licence file of the server bundle. */
  bundled: readonly BundledSoftware[]
  /** The components inside packages of the SBOM of pnpm, by `<package>@<version>`. */
  inside: Readonly<Record<string, readonly Component[]>>
  /** The bundled packages that the SBOM of pnpm does not list. */
  unlisted: readonly Component[]
  /** The distroless Node.js base image. */
  base: Component
}

/**
 * Turns the production SBOM of `pnpm sbom` for the report server package into the SBOM of the report server image.
 *
 * @throws Error If a bundled package has no component.
 */
export function reportServerSbom(bom: Bom, image: ReportServerImage): Bom {
  const repository = reportServerRepository()
  const purl = ociPurl(repository.split('/').at(-1)!, repository, image.version)
  return composeSbom(bundledOnly(bom, image.bundled), {
    ...image,
    extra: [image.base],
    root: {
      ...bom.metadata.component,
      type: 'container',
      name: 'Diagrams report server',
      version: image.version,
      'bom-ref': purl,
      purl,
      description: 'The server that keeps encrypted problem reports of Diagrams, on a distroless Node.js base.',
      externalReferences: [
        { type: 'vcs', url: REPOSITORY_URL },
        { type: 'issue-tracker', url: `${REPOSITORY_URL}/issues` },
      ],
    },
  })
}

async function main() {
  const [input, version, output] = process.argv.slice(2)
  if (!input || !version || !output) {
    throw new Error('Usage: node scripts/report-server-sbom.ts <pnpm sbom file> <version> <output file>')
  }
  if (!existsSync(LICENCE_FILE)) throw new Error(`Run pnpm report-server:build first. ${LICENCE_FILE} is missing.`)
  const bundled = readNoticeText(readFileSync(LICENCE_FILE, 'utf8'))
  const bom = JSON.parse(readFileSync(input, 'utf8')) as Bom
  const sbom = reportServerSbom(bom, {
    version,
    bundled,
    inside: await programsInside(bundled),
    unlisted: bundledPackages(bundled, listedPackages(bom)),
    base: baseImageComponent(pinnedImages(readFileSync(DOCKERFILE, 'utf8'))),
  })
  writeFileSync(output, `${JSON.stringify(sbom, null, 2)}\n`)
}

if (import.meta.main) await main()
