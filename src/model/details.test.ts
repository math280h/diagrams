import { describe, expect, it } from 'vitest'
import { hasDetails, linkifyText, linkText, safeLinkUrl } from './details'

describe('safeLinkUrl', () => {
  it('keeps web and mail addresses and adds https to a bare host', () => {
    expect(safeLinkUrl('https://docs.stripe.com/api')).toBe('https://docs.stripe.com/api')
    expect(safeLinkUrl(' github.com/acme/api ')).toBe('https://github.com/acme/api')
    expect(safeLinkUrl('grafana.internal:3000/d/orders')).toBe('https://grafana.internal:3000/d/orders')
    expect(safeLinkUrl('mailto:payments@acme.dev')).toBe('mailto:payments@acme.dev')
  })

  it('refuses addresses that run code or open no page', () => {
    expect(safeLinkUrl('javascript:alert(1)')).toBeNull()
    expect(safeLinkUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeLinkUrl('the runbook')).toBeNull()
    expect(safeLinkUrl('')).toBeNull()
  })
})

describe('linkText', () => {
  it('shows the label, or the address without the scheme', () => {
    expect(linkText({ label: 'Runbook', url: 'https://x.dev/run' })).toBe('Runbook')
    expect(linkText({ label: ' ', url: 'https://x.dev/run/' })).toBe('x.dev/run')
    expect(linkText({ label: '', url: 'mailto:ops@x.dev' })).toBe('ops@x.dev')
  })
})

describe('linkifyText', () => {
  it('finds web addresses and leaves the punctuation after them in the text', () => {
    expect(linkifyText('See https://x.dev/docs. Or javascript:alert(1)')).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'link', text: 'https://x.dev/docs', href: 'https://x.dev/docs' },
      { kind: 'text', text: '. Or javascript:alert(1)' },
    ])
  })
})

describe('hasDetails', () => {
  it('is false for empty or blank details', () => {
    expect(hasDetails({ description: ' ', owner: '', links: [] })).toBe(false)
    expect(hasDetails({ description: '', owner: 'Ops', links: [] })).toBe(true)
  })
})
