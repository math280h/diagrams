import { describe, expect, it } from 'vitest'
import { majorTagRelease, tagCommit } from './release-major-tag.ts'

const release = (tagName: string, kind: 'stable' | 'draft' | 'pre-release' = 'stable') => ({
  tagName,
  isDraft: kind === 'draft',
  isPrerelease: kind === 'pre-release',
})

const RELEASES = [
  release('preview-57', 'pre-release'),
  release('v1.1.0-beta.1', 'pre-release'),
  release('v1.0.0'),
  release('v0.10.0'),
  release('v0.9.0'),
  release('v1.0.1', 'draft'),
]

describe('majorTagRelease', () => {
  it('takes the newest published stable release', () => {
    expect(majorTagRelease(RELEASES)).toEqual({ tag: 'v1.0.0', majorTag: 'v1' })
  })

  it('takes the newest release of an earlier major version', () => {
    expect(majorTagRelease(RELEASES, 'v0.10.0')).toEqual({ tag: 'v0.10.0', majorTag: 'v0' })
  })

  it('refuses drafts, pre-releases and missing releases', () => {
    expect(() => majorTagRelease(RELEASES, 'v1.0.1')).toThrow('v1.0.1 is a draft. Publish it first.')
    expect(() => majorTagRelease(RELEASES, 'v1.1.0-beta.1')).toThrow(
      'v1.1.0-beta.1 is a pre-release. Only a stable release moves the major tag.',
    )
    expect(() => majorTagRelease(RELEASES, 'preview-57')).toThrow('preview-57 is a pre-release.')
    expect(() => majorTagRelease(RELEASES, 'v2.0.0')).toThrow('v2.0.0 has no release.')
    expect(() => majorTagRelease([release('v1.0.0', 'draft')])).toThrow('There is no published stable release.')
  })

  it('refuses a release that is not the newest of its major version', () => {
    expect(() => majorTagRelease(RELEASES, 'v0.9.0')).toThrow('v0.10.0 is newer than v0.9.0, so v0 stays at v0.10.0.')
  })
})

describe('tagCommit', () => {
  const [tagObject, commit, other] = ['a', 'b', 'c'].map((digit) => digit.repeat(40))
  const lsRemote = [
    `${tagObject}\trefs/tags/v1.0.0`,
    `${commit}\trefs/tags/v1.0.0^{}`,
    `${other}\trefs/tags/v1`,
    '',
  ].join('\n')

  it('reads the commit of an annotated or a lightweight tag', () => {
    expect(tagCommit(lsRemote, 'v1.0.0')).toBe(commit)
    expect(tagCommit(lsRemote, 'v1')).toBe(other)
  })

  it('returns null for a missing tag', () => {
    expect(tagCommit(lsRemote, 'v0')).toBeNull()
  })
})
