import { describe, expect, it } from 'vitest'
import { baseImageComponent, imageSbom, pinnedImages, serverComponent, type WebsiteImage } from './image-sbom.ts'
import type { Component } from './sbom-components.ts'
import type { Bom } from './sbom.ts'

const DIGEST = `sha256:${'a'.repeat(64)}`

const DOCKERFILE = [
  `FROM --platform=$BUILDPLATFORM ghcr.io/pnpm/pnpm:12.16.1@${DIGEST} AS pnpm`,
  `FROM ghcr.io/static-web-server/static-web-server:2.44.1@${DIGEST} AS server`,
  'FROM node:26 AS build',
  'FROM build AS sbom-build',
  'FROM scratch AS sbom',
  `FROM gcr.io/distroless/static-debian13:nonroot@${DIGEST}`,
].join('\n')

function npm(name: string, version: string): Component {
  const ref = `pkg:npm/${name}@${version}`
  return { type: 'library', name, version, purl: ref, 'bom-ref': ref }
}

const ROOT = 'pkg:npm/diagrams@0.1.1'

const PNPM_SBOM: Bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  metadata: {
    timestamp: '2026-11-10T20:00:00.000Z',
    component: { type: 'application', name: 'diagrams', version: '0.1.1', purl: ROOT, 'bom-ref': ROOT },
  },
  components: [npm('zod', '4.6.7'), npm('hono', '4.13.16'), npm('fflate', '0.8.3')],
  dependencies: [
    { ref: ROOT, dependsOn: ['pkg:npm/zod@4.6.7', 'pkg:npm/hono@4.13.16'] },
    { ref: 'pkg:npm/zod@4.6.7', dependsOn: [] },
    { ref: 'pkg:npm/hono@4.13.16', dependsOn: ['pkg:npm/fflate@0.8.3'] },
    { ref: 'pkg:npm/fflate@0.8.3', dependsOn: [] },
  ],
}

const IMAGES = pinnedImages(DOCKERFILE)

const IMAGE: WebsiteImage = {
  version: '0.2.0',
  bundled: [
    { name: 'zod', version: '4.6.7' },
    { name: 'fflate', version: '0.8.3' },
  ],
  inside: {},
  unlisted: [],
  data: [{ type: 'data', name: 'Simple Icons', 'bom-ref': 'icons:logos' }],
  server: serverComponent(IMAGES),
  base: baseImageComponent(IMAGES),
}

const IMAGE_PURL = 'pkg:oci/diagrams?repository_url=ghcr.io/math280h/diagrams&tag=0.2.0'

describe('pinned images', () => {
  it('reads the repository, tag and digest of each pinned FROM line', () => {
    expect(IMAGES).toEqual([
      { repository: 'ghcr.io/pnpm/pnpm', tag: '12.16.1', digest: DIGEST },
      { repository: 'ghcr.io/static-web-server/static-web-server', tag: '2.44.1', digest: DIGEST },
      { repository: 'gcr.io/distroless/static-debian13', tag: 'nonroot', digest: DIGEST },
    ])
  })

  it('names static-web-server with its crate and licences', () => {
    expect(serverComponent(IMAGES)).toMatchObject({
      name: 'static-web-server',
      version: '2.44.1',
      purl: 'pkg:cargo/static-web-server@2.44.1',
      licenses: [{ expression: 'MIT OR Apache-2.0' }],
    })
  })

  it('names the base image with an OCI purl at its digest', () => {
    expect(baseImageComponent(IMAGES)).toMatchObject({
      type: 'container',
      name: 'static-debian13',
      version: DIGEST,
      purl: `pkg:oci/static-debian13@sha256%3A${'a'.repeat(64)}?repository_url=gcr.io/distroless/static-debian13&tag=nonroot`,
    })
  })

  it('fails when the Dockerfile pins no server or base image', () => {
    expect(() => serverComponent([])).toThrow(/pins no ghcr.io\/static-web-server\/static-web-server image/)
    expect(() => baseImageComponent([])).toThrow(/pins no distroless image/)
  })
})

describe('image SBOM', () => {
  it('names the image at the release version, with an OCI purl', () => {
    expect(imageSbom(PNPM_SBOM, IMAGE).metadata.component).toMatchObject({
      type: 'container',
      name: 'Diagrams website',
      version: '0.2.0',
      purl: IMAGE_PURL,
      'bom-ref': IMAGE_PURL,
    })
  })

  it('keeps only the packages in the website bundles', () => {
    const sbom = imageSbom(PNPM_SBOM, IMAGE)
    expect(sbom.components.map((component) => component.name)).toEqual([
      'zod',
      'fflate',
      'static-web-server',
      'static-debian13',
      'Simple Icons',
    ])
    expect(sbom.dependencies.map((dependency) => dependency.ref)).not.toContain('pkg:npm/hono@4.13.16')
  })

  it('makes a bundled package that only a left-out package needs a dependency of the image', () => {
    const root = imageSbom(PNPM_SBOM, IMAGE).dependencies.find((dependency) => dependency.ref === IMAGE_PURL)
    expect(root?.dependsOn).toEqual([
      'pkg:npm/zod@4.6.7',
      'pkg:npm/fflate@0.8.3',
      'pkg:cargo/static-web-server@2.44.1',
      IMAGE.base['bom-ref'],
      'icons:logos',
    ])
  })

  it('fails when a bundled package has no component', () => {
    const bundled = [...IMAGE.bundled, { name: 'elkjs', version: '0.12.1' }]
    expect(() => imageSbom(PNPM_SBOM, { ...IMAGE, bundled })).toThrow(
      /no component for these bundled packages: elkjs@0.12.1./,
    )
  })
})
