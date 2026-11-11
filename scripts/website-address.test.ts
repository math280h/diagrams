import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { OFFICIAL_WEBSITE } from '../src/desktop/build-config.ts'
import { withWebsiteAddress } from './website-address.ts'

const PAGE = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

describe('withWebsiteAddress', () => {
  it('points the link preview tags at the website of the build', () => {
    const html = withWebsiteAddress(PAGE, 'https://diagrams.example.com')
    expect(html).toContain('<meta property="og:url" content="https://diagrams.example.com/" />')
    expect(html).toContain('<meta property="og:image" content="https://diagrams.example.com/social-preview.png" />')
    expect(html).not.toContain(OFFICIAL_WEBSITE)
  })

  it('keeps the page of the official build', () => {
    expect(withWebsiteAddress(PAGE, OFFICIAL_WEBSITE)).toBe(PAGE)
  })
})
