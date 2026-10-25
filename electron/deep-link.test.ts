import { describe, expect, it } from 'vitest'
import { findDeepLink, parseReceiveLink } from './deep-link'

describe('deep links', () => {
  const code = 'c'.repeat(43)

  it('finds the link among Chromium switches', () => {
    expect(findDeepLink(['app.exe', '--allow-file-access', `diagrams://receive?code=${code}`])).toBe(
      `diagrams://receive?code=${code}`,
    )
    expect(findDeepLink(['app.exe', '.'])).toBeNull()
  })

  it('reads the code of a receive link and nothing else', () => {
    expect(parseReceiveLink(`diagrams://receive?code=${code}`)).toBe(code)
    expect(parseReceiveLink(`diagrams://receive/?code=${code}`)).toBe(code)
    expect(parseReceiveLink(`diagrams://open?code=${code}`)).toBeNull()
    expect(parseReceiveLink('diagrams://receive?code=short')).toBeNull()
    expect(parseReceiveLink(`https://receive?code=${code}`)).toBeNull()
    expect(parseReceiveLink('not a url')).toBeNull()
  })
})
