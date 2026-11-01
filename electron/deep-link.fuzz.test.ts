import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DEEP_LINK_SCHEME, RANDOM_KEY_PATTERN } from '@/desktop/constants'
import { findDeepLink, parseReceiveLink } from './deep-link'

const code = fc.oneof(fc.string(), fc.stringMatching(/^[\w-]{43}$/), fc.stringMatching(/^[\w%+.-]{40,46}$/))
const link = fc.oneof(
  fc.string(),
  fc.webUrl({ withQueryParameters: true, withFragments: true }),
  fc
    .tuple(
      fc.constantFrom('diagrams', 'DIAGRAMS', 'diagram', 'http'),
      fc.constantFrom('://', ':', ':///'),
      fc.string(),
      code,
    )
    .map(([scheme, separator, host, value]) => `${scheme}${separator}${host}?code=${value}`),
  code.map((value) => `${DEEP_LINK_SCHEME}://receive?code=${value}`),
)

describe('deep link input', () => {
  it('returns a handoff code only for a receive link with a valid code', () => {
    fc.assert(
      fc.property(link, (url) => {
        const result = parseReceiveLink(url)
        if (result === null) return
        expect(result).toMatch(RANDOM_KEY_PATTERN)
        expect(new URL(url).protocol).toBe(`${DEEP_LINK_SCHEME}:`)
      }),
      { numRuns: 1000 },
    )
  })

  it('finds only an argument with the deep link scheme', () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(fc.string(), link)), (argv) => {
        const found = findDeepLink(argv)
        if (found === null) return
        expect(argv).toContain(found)
        expect(found.toLowerCase().startsWith(`${DEEP_LINK_SCHEME}:`)).toBe(true)
      }),
    )
  })
})
