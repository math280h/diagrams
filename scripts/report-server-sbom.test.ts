import { describe, expect, it } from 'vitest'
import { baseImageComponent, pinnedImages } from './image-sbom.ts'
import { reportServerRepository, reportServerSbom } from './report-server-sbom.ts'
import type { Component } from './sbom-components.ts'
import type { Bom } from './sbom.ts'

const DIGEST = `sha256:${'b'.repeat(64)}`
const ROOT = 'pkg:npm/report-server@0.0.0'

function npm(name: string, version: string): Component {
  const ref = `pkg:npm/${name}@${version}`
  return { type: 'library', name, version, purl: ref, 'bom-ref': ref }
}

const PNPM_SBOM: Bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  metadata: {
    component: { type: 'application', name: 'report-server', version: '0.0.0', purl: ROOT, 'bom-ref': ROOT },
  },
  components: [npm('hono', '4.13.18'), npm('esbuild', '0.28.2')],
  dependencies: [
    { ref: ROOT, dependsOn: ['pkg:npm/hono@4.13.18', 'pkg:npm/esbuild@0.28.2'] },
    { ref: 'pkg:npm/hono@4.13.18', dependsOn: [] },
    { ref: 'pkg:npm/esbuild@0.28.2', dependsOn: [] },
  ],
}

describe('reportServerSbom', () => {
  it('names the image, and keeps only the bundled packages and the base image', () => {
    const base = baseImageComponent(pinnedImages(`FROM gcr.io/distroless/nodejs26-debian13:nonroot@${DIGEST}`))
    const sbom = reportServerSbom(PNPM_SBOM, {
      version: '0.3.0',
      bundled: [{ name: 'hono', version: '4.13.18' }],
      inside: {},
      unlisted: [],
      base,
    })
    expect(sbom.metadata.component).toMatchObject({
      type: 'container',
      name: 'Diagrams report server',
      version: '0.3.0',
      purl: `pkg:oci/diagrams-report-server?repository_url=${reportServerRepository()}&tag=0.3.0`,
    })
    expect(sbom.components.map((component) => component.name)).toEqual(['hono', 'nodejs26-debian13'])
  })

  it('refuses a bundled package that the SBOM of pnpm does not list', () => {
    expect(() =>
      reportServerSbom(PNPM_SBOM, {
        version: '0.3.0',
        bundled: [{ name: 'zod', version: '4.6.7' }],
        inside: {},
        unlisted: [],
        base: { type: 'container', name: 'base', 'bom-ref': 'base' },
      }),
    ).toThrow('zod@4.6.7')
  })

  it('appends -report-server to the image of the repository', () => {
    expect(reportServerRepository('https://github.com/Acme/Diagrams')).toBe('ghcr.io/acme/diagrams-report-server')
  })
})
