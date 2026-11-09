import { describe, expect, it } from 'vitest'
import { majorOf, releaseProblems, sampleProblems } from './release-formats.ts'

const RELEASES = [
  { tag: 'v0.1.0', format: 6 },
  { tag: 'v0.1.3', format: 7 },
  { tag: 'v0.1.4', format: 8 },
]
const POLICY = { oldestFormat: 6, previewFormats: [9, 10], releaseMajor: 0 }

describe('majorOf', () => {
  it('reads release tags and leaves out previews', () => {
    expect(majorOf('v1.2.3')).toBe(1)
    expect(majorOf('v0.2.0-beta.1')).toBeNull()
    expect(majorOf('preview-57')).toBeNull()
  })
})

describe('releaseProblems', () => {
  it('accepts code that opens the format of every release of its major version', () => {
    expect(releaseProblems(RELEASES, POLICY)).toEqual([])
    expect(releaseProblems(RELEASES, POLICY, 'v0.2.0')).toEqual([])
  })

  it('refuses a minor or patch release that stops to open the format of an earlier release', () => {
    const problems = releaseProblems(RELEASES, { ...POLICY, oldestFormat: 7 }, 'v0.2.0')
    expect(problems).toEqual([expect.stringContaining('v0.1.0 wrote format 6, but OLDEST_FORMAT is 7')])
  })

  it('lets the first release of a new major version drop the formats of the earlier one', () => {
    const policy = { ...POLICY, oldestFormat: 16, releaseMajor: 1 }
    expect(releaseProblems(RELEASES, policy, 'v1.0.0')).toEqual([])
    expect(releaseProblems(RELEASES, policy, 'v0.2.0')).toEqual([
      'v0.2.0 has the major version 0, but RELEASE_MAJOR is 1.',
      'RELEASE_MAJOR starts a new major version, so the next release is v1.0.0.',
    ])
  })

  it('keeps the formats of the releases in a new major version', () => {
    const releases = [...RELEASES, { tag: 'v1.0.0', format: 16 }]
    const policy = { ...POLICY, oldestFormat: 17, releaseMajor: 1 }
    expect(releaseProblems(releases, policy, 'v1.1.0')).toEqual([expect.stringContaining('v1.0.0 wrote format 16')])
  })

  it('refuses a release major that skips a version or goes back', () => {
    expect(releaseProblems(RELEASES, { ...POLICY, releaseMajor: 2 })).toEqual([
      'RELEASE_MAJOR is 2, but the newest release has the major version 0.',
    ])
  })

  it('refuses a preview format that a release wrote', () => {
    expect(releaseProblems([...RELEASES, { tag: 'v0.1.5', format: 9 }], POLICY)).toEqual([
      'PREVIEW_FORMATS holds format 9, but v0.1.5 wrote it.',
    ])
  })
})

describe('sampleProblems', () => {
  it('accepts new sample files', () => {
    expect(sampleProblems(['A\tsrc/persistence/formats/v17.json'], 6, false)).toEqual([])
  })

  it('refuses a change to a sample file or its deletion', () => {
    const problems = sampleProblems(
      ['M\tsrc/persistence/formats/v8.json', 'D\tsrc/share/samples/y-checkout-flow.txt'],
      6,
      false,
    )
    expect(problems).toEqual([
      expect.stringContaining('changes src/persistence/formats/v8.json'),
      expect.stringContaining('deletes src/share/samples/y-checkout-flow.txt'),
    ])
  })

  it('lets a new major version delete the samples of the formats that it drops', () => {
    const changes = [
      'D\tsrc/persistence/formats/v6.json',
      'D\tsrc/export/samples/v16.png',
      'D\tsrc/persistence/formats/v17.json',
    ]
    expect(sampleProblems(changes, 17, true)).toEqual([
      expect.stringContaining('deletes src/persistence/formats/v17.json'),
    ])
  })
})
