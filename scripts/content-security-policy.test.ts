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
    expect(added).toEqual([
      'https://api.github.com',
      ...Array.from({ length: 10 }, (_, index) => `http://127.0.0.1:${27419 + index}`),
    ])
    for (const [directive, sources] of Object.entries(websitePolicy())) {
      if (directive !== 'connect-src') expect(sources).toEqual(RENDERER_POLICY[directive])
    }
  })

  it('lets the website connect to the origin of the report server of the build', () => {
    expect(websitePolicy('https://reports.example.com/v1-base')['connect-src']?.at(-1)).toBe(
      'https://reports.example.com',
    )
    expect(websitePolicy(null)['connect-src']).toEqual(websitePolicy()['connect-src'])
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
