import { describe, expect, it } from 'vitest'
import { policyText, RENDERER_POLICY } from '../src/content-security-policy.ts'
import { contentSecurityPolicy, websitePolicy } from './content-security-policy.ts'

describe('content security policy', () => {
  it('writes each directive with its sources', () => {
    expect(policyText({ 'default-src': ["'self'"], 'img-src': ["'self'", 'data:'] })).toBe(
      "default-src 'self'; img-src 'self' data:",
    )
  })

  it('gives the website every source of the desktop renderer, without frame-ancestors', () => {
    const website = websitePolicy()
    for (const [directive, sources] of Object.entries(RENDERER_POLICY)) {
      if (directive === 'frame-ancestors') expect(website[directive]).toBeUndefined()
      else expect(website[directive]).toEqual(expect.arrayContaining([...sources]))
    }
  })

  it('lets the website connect only to the hosts of the network connections table', () => {
    const added = websitePolicy()['connect-src']?.filter((source) => !RENDERER_POLICY['connect-src']?.includes(source))
    expect(added).toEqual(['https://api.github.com', 'http://127.0.0.1:27419'])
    for (const [directive, sources] of Object.entries(websitePolicy())) {
      if (directive !== 'connect-src') expect(sources).toEqual(RENDERER_POLICY[directive])
    }
  })

  it('puts the policy in a meta element before every other element of the head', () => {
    const plugin = contentSecurityPolicy()
    expect(plugin.apply).toBe('build')
    const transform = plugin.transformIndexHtml as () => unknown
    expect(transform()).toEqual([
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: policyText(websitePolicy()) },
        injectTo: 'head-prepend',
      },
    ])
  })
})
