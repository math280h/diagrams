import { describe, expect, it } from 'vitest'
import {
  OFFICIAL_BUILD,
  readBuildConfig,
  releaseLinks,
  reportServerUrl,
  repositoryName,
  websiteOrigin,
} from './build-config'

const KEY = 'age1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqs3290gq'
const OTHER_KEY = 'age1zvkyg2lqzraa2lnjvqej32nkuu0ues2s82hzrye869xeexvn73equnujwj'

describe('websiteOrigin', () => {
  it('returns the origin of an https address, with https for an address without a scheme', () => {
    expect(websiteOrigin(' https://Diagrams.Example.com/#/d/abc ')).toBe('https://diagrams.example.com')
    expect(websiteOrigin('diagrams.example.com:8443')).toBe('https://diagrams.example.com:8443')
  })

  it('accepts plain http only on this computer', () => {
    expect(websiteOrigin('http://localhost:8080')).toBe('http://localhost:8080')
    expect(websiteOrigin('http://127.0.0.1:4173/')).toBe('http://127.0.0.1:4173')
    expect(websiteOrigin('http://[::1]:8080')).toBe('http://[::1]:8080')
    expect(websiteOrigin('http://diagrams.example.com')).toBeNull()
  })

  it('refuses other schemes, user names and text that is not an address', () => {
    expect(websiteOrigin('ftp://diagrams.example.com')).toBeNull()
    expect(websiteOrigin('https://user:secret@diagrams.example.com')).toBeNull()
    expect(websiteOrigin('not an address')).toBeNull()
    expect(websiteOrigin('')).toBeNull()
  })
})

describe('repositoryName', () => {
  it('returns owner/name, also from the address of the repository', () => {
    expect(repositoryName('acme/diagrams')).toBe('acme/diagrams')
    expect(repositoryName(' https://github.com/acme/diagrams.git/ ')).toBe('acme/diagrams')
    expect(repositoryName('github.com/acme/my.diagrams_2')).toBe('acme/my.diagrams_2')
  })

  it('refuses text that does not name a repository', () => {
    for (const text of ['acme', 'acme/', '/diagrams', 'acme/diagrams/releases', '-acme/diagrams', 'acme/..', 'a b/c']) {
      expect(repositoryName(text)).toBeNull()
    }
  })
})

describe('readBuildConfig', () => {
  it('gives the official build without variables, and for empty variables', () => {
    expect(readBuildConfig({})).toEqual(OFFICIAL_BUILD)
    expect(readBuildConfig({ DIAGRAMS_WEBSITE: '', DIAGRAMS_REPOSITORY: ' ', DIAGRAMS_GITHUB_APP: '' })).toEqual(
      OFFICIAL_BUILD,
    )
  })

  it('reads each variable', () => {
    expect(
      readBuildConfig({
        DIAGRAMS_WEBSITE: 'https://diagrams.example.com/',
        DIAGRAMS_REPOSITORY: 'Acme/diagrams',
        DIAGRAMS_REPOSITORY_EDITABLE: '1',
        DIAGRAMS_GITHUB_APP: 'Iv23liExample01',
      }),
    ).toEqual({
      website: 'https://diagrams.example.com',
      repository: 'Acme/diagrams',
      repositoryEditable: true,
      githubApp: 'Iv23liExample01',
      reports: { url: null, recipients: [] },
    })
    expect(readBuildConfig({ DIAGRAMS_REPOSITORY_EDITABLE: '0' }).repositoryEditable).toBe(false)
  })

  it('stops the build for a value that it cannot use', () => {
    expect(() => readBuildConfig({ DIAGRAMS_WEBSITE: 'http://diagrams.example.com' })).toThrow('DIAGRAMS_WEBSITE')
    expect(() => readBuildConfig({ DIAGRAMS_REPOSITORY: 'diagrams' })).toThrow('DIAGRAMS_REPOSITORY')
    expect(() => readBuildConfig({ DIAGRAMS_REPOSITORY_EDITABLE: 'yes' })).toThrow('DIAGRAMS_REPOSITORY_EDITABLE')
    expect(() => readBuildConfig({ DIAGRAMS_GITHUB_APP: '123456' })).toThrow('client ID of a GitHub App')
  })

  it('reads the report server and its keys, with no server in the official build', () => {
    expect(OFFICIAL_BUILD.reports).toEqual({ url: null, recipients: [] })
    expect(
      readBuildConfig({
        DIAGRAMS_REPORT_URL: 'https://reports.example.com/v/',
        DIAGRAMS_REPORT_KEYS: `${KEY}, ${OTHER_KEY}`,
      }).reports,
    ).toEqual({ url: 'https://reports.example.com/v', recipients: [KEY, OTHER_KEY] })
    expect(readBuildConfig({ DIAGRAMS_REPORT_KEYS: KEY }).reports).toEqual({ url: null, recipients: [KEY] })
  })

  it('stops the build for a report server that it cannot use', () => {
    expect(() =>
      readBuildConfig({ DIAGRAMS_REPORT_URL: 'http://reports.example.com', DIAGRAMS_REPORT_KEYS: KEY }),
    ).toThrow('DIAGRAMS_REPORT_URL must be')
    expect(() => readBuildConfig({ DIAGRAMS_REPORT_URL: 'https://reports.example.com' })).toThrow(
      'DIAGRAMS_REPORT_URL needs DIAGRAMS_REPORT_KEYS',
    )
    expect(() => readBuildConfig({ DIAGRAMS_REPORT_KEYS: 'AGE-SECRET-KEY-1ABC' })).toThrow(
      'One is "AGE-SECRET-KEY-1ABC"',
    )
  })
})

describe('reportServerUrl', () => {
  it('returns the base address without a final slash', () => {
    expect(reportServerUrl(' https://Reports.Example.com/ ')).toBe('https://reports.example.com')
    expect(reportServerUrl('https://example.com/reports/')).toBe('https://example.com/reports')
    expect(reportServerUrl('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787')
  })

  it('refuses addresses with a query, a fragment, a user name or plain http on the network', () => {
    for (const text of [
      'https://reports.example.com/?a=1',
      'https://reports.example.com/#a',
      'https://user@reports.example.com',
      'http://reports.example.com',
      'reports.example.com',
      'ftp://reports.example.com',
    ]) {
      expect(reportServerUrl(text)).toBeNull()
    }
  })
})

describe('releaseLinks', () => {
  it('gives the release addresses of a repository', () => {
    const links = releaseLinks('acme/diagrams')
    expect(links.latestRelease).toBe('https://github.com/acme/diagrams/releases/latest')
    expect(links.latestReleaseApi).toBe('https://api.github.com/repos/acme/diagrams/releases/latest')
    expect(links.assetPrefix).toBe('https://github.com/acme/diagrams/releases/download/')
    expect(links.releaseTag('1.2.3')).toBe('https://github.com/acme/diagrams/releases/tag/v1.2.3')
  })
})
