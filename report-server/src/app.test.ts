import { describe, expect, it, vi } from 'vitest'
import { AGE_HEADER } from '@/reports/age-file'
import { REPORT_API, receiptSchema } from '@/reports/protocol'
import { createApp } from './app'
import { readConfig } from './config'
import { noProof } from './pow/none'
import type { ProofProvider } from './pow/provider'
import type { ReportStore, StoredReport } from './storage/store'

const AGE_FILE = new TextEncoder().encode(`${AGE_HEADER}-> X25519 stanza\n`)

function memoryStore(): ReportStore & { reports: Map<string, StoredReport> } {
  const reports = new Map<string, StoredReport>()
  return {
    reports,
    async put(id, _bytes, report) {
      reports.set(id, report)
    },
    async remove(id, deleteHash) {
      const report = reports.get(id)
      if (!report) return 'missing'
      if (report.deleteHash !== deleteHash) return 'forbidden'
      reports.delete(id)
      return 'deleted'
    },
    async sweep() {
      return 0
    },
  }
}

function setup(env: Record<string, string> = {}, options: { store?: ReportStore; proof?: ProofProvider } = {}) {
  const config = readConfig({ STORAGE: 'fs', ...env })
  let time = Date.parse('2026-11-12T10:00:00Z')
  let socket = '203.0.113.7'
  const store = options.store ?? memoryStore()
  const app = createApp({
    config,
    store,
    proof: options.proof ?? noProof(),
    now: () => time,
    socketAddress: () => socket,
  })
  return {
    app,
    store,
    advance: (ms: number) => {
      time += ms
    },
    from: (address: string) => {
      socket = address
    },
    post: (headers: Record<string, string> = {}) =>
      app.request(REPORT_API.reports, { method: 'POST', body: AGE_FILE, headers }),
  }
}

describe('createApp', () => {
  it('sets the security headers on each answer', async () => {
    const { app } = setup()
    const response = await app.request('/nothing-here')
    expect(response.status).toBe(404)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'")
    expect(await response.json()).toEqual({ message: 'Not found.' })
  })

  it('gives a receipt that expires after the retention time', async () => {
    const { post, store } = setup({ RETENTION_DAYS: '7' })
    const response = await post()
    expect(response.status).toBe(201)
    const receipt = receiptSchema.parse(await response.json())
    expect(receipt.expiresAt).toBe(Date.parse('2026-11-19T10:00:00Z'))
    const stored = (store as ReturnType<typeof memoryStore>).reports.get(receipt.id)
    expect(stored?.deleteHash).toMatch(/^[\da-f]{64}$/)
    expect(stored?.deleteHash).not.toContain(receipt.deleteToken)
  })

  it('limits the reports of each network for an hour', async () => {
    const { post, advance, from } = setup({ REPORTS_PER_HOUR: '2' })
    expect((await post()).status).toBe(201)
    expect((await post()).status).toBe(201)
    const limited = await post()
    expect(limited.status).toBe(429)
    expect(await limited.json()).toEqual({ message: 'Too many reports from this network.' })
    from('198.51.100.1')
    expect((await post()).status).toBe(201)
    from('203.0.113.7')
    advance(60 * 60 * 1000)
    expect((await post()).status).toBe(201)
  })

  it('counts the addresses of one IPv6 /64 network together', async () => {
    const { post, from } = setup({ REPORTS_PER_HOUR: '1' })
    from('2001:db8:1:2::1')
    expect((await post()).status).toBe(201)
    from('2001:db8:1:2:ffff::9')
    expect((await post()).status).toBe(429)
    from('2001:db8:1:3::1')
    expect((await post()).status).toBe(201)
  })

  it('counts the client behind the trusted proxies, not the proxy', async () => {
    const { post } = setup({ REPORTS_PER_HOUR: '1', TRUST_PROXY_HOPS: '1' })
    expect((await post({ 'x-forwarded-for': '192.0.2.1' })).status).toBe(201)
    expect((await post({ 'x-forwarded-for': '192.0.2.2' })).status).toBe(201)
    expect((await post({ 'x-forwarded-for': 'spoofed, 192.0.2.2' })).status).toBe(429)
  })

  it('counts the visitor behind a trusted CDN, and a client that skips the CDN by its own address', async () => {
    const { post } = setup({ REPORTS_PER_HOUR: '1', CLIENT_IP_HEADER: 'X-Real-IP', TRUSTED_PROXIES: '173.245.48.0/20' })
    expect((await post({ 'x-real-ip': '173.245.48.1', 'x-forwarded-for': '192.0.2.1' })).status).toBe(201)
    expect((await post({ 'x-real-ip': '173.245.48.2', 'x-forwarded-for': 'spoofed, 192.0.2.1' })).status).toBe(429)
    expect((await post({ 'x-real-ip': '192.0.2.9', 'x-forwarded-for': '192.0.2.50' })).status).toBe(201)
    expect((await post({ 'x-real-ip': '192.0.2.9', 'x-forwarded-for': '192.0.2.51' })).status).toBe(429)
  })

  it('stops for the day at the daily quota', async () => {
    const { post, advance } = setup({ DAILY_REPORTS: '1' })
    expect((await post()).status).toBe(201)
    expect((await post()).status).toBe(503)
    advance(24 * 60 * 60 * 1000)
    expect((await post()).status).toBe(201)
  })

  it('gives back the quota when the store fails, and tells no details', async () => {
    const failing = memoryStore()
    failing.put = async () => {
      throw new Error('disk full at /data/reports')
    }
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { post } = setup({ DAILY_REPORTS: '1' }, { store: failing })
    const response = await post()
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ message: 'The server could not store the report.' })
    failing.put = async () => {}
    expect((await post()).status).toBe(201)
    error.mockRestore()
  })

  it('checks the proof of work for the size of the report', async () => {
    const verify = vi.fn<ProofProvider['verify']>(async () => false)
    const { post } = setup({}, { proof: { issue: async () => ({ provider: 'none' }), verify } })
    expect((await post({ 'x-report-proof': 'abc' })).status).toBe(403)
    expect(verify).toHaveBeenCalledWith('abc', 'text')
  })

  it('limits the challenges of each network for an hour', async () => {
    const { app } = setup({ CHALLENGES_PER_HOUR: '1' })
    expect((await app.request(`${REPORT_API.challenge}?size=10`)).status).toBe(200)
    expect((await app.request(`${REPORT_API.challenge}?size=10`)).status).toBe(429)
  })

  it('answers a failure with a message without details', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const proof: ProofProvider = {
      issue: async () => {
        throw new Error('secret detail')
      },
      verify: async () => false,
    }
    const { app } = setup({}, { proof })
    const response = await app.request(`${REPORT_API.challenge}?size=10`)
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('secret detail')
    expect(error).toHaveBeenCalledWith('Request failed: Error')
    error.mockRestore()
  })
})
