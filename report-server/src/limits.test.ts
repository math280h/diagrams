import { describe, expect, it } from 'vitest'
import { clientAddress, DailyQuota, HourlyLimit, limitKey } from './limits'

describe('HourlyLimit', () => {
  it('starts a new hour for each address on its own', () => {
    let time = 0
    const limit = new HourlyLimit(1, () => time)
    expect(limit.take('a')).toBe(true)
    expect(limit.take('a')).toBe(false)
    expect(limit.take('b')).toBe(true)
    time = 60 * 60 * 1000
    expect(limit.take('a')).toBe(true)
  })
})

describe('DailyQuota', () => {
  it('counts reports and bytes, and gives them back', () => {
    const quota = new DailyQuota(2, 100, () => 0)
    expect(quota.take(60)).toBe(true)
    expect(quota.take(60)).toBe(false)
    quota.release(60)
    expect(quota.take(100)).toBe(true)
    expect(quota.take(1)).toBe(false)
    expect(quota.take(0)).toBe(true)
    expect(quota.take(0)).toBe(false)
  })

  it('starts again on a new day in UTC', () => {
    let time = Date.parse('2026-11-12T23:59:00Z')
    const quota = new DailyQuota(1, 100, () => time)
    expect(quota.take(1)).toBe(true)
    expect(quota.take(1)).toBe(false)
    time = Date.parse('2026-11-13T00:00:00Z')
    expect(quota.take(1)).toBe(true)
  })
})

describe('clientAddress', () => {
  it('uses the socket address without trusted proxies', () => {
    expect(clientAddress('10.0.0.1', '192.0.2.1', 0)).toBe('10.0.0.1')
    expect(clientAddress(null, null, 0)).toBe('unknown')
  })

  it('takes the address that the outermost trusted proxy saw', () => {
    expect(clientAddress('10.0.0.1', 'spoofed, 192.0.2.1', 1)).toBe('192.0.2.1')
    expect(clientAddress('10.0.0.1', 'spoofed, 192.0.2.1, 10.0.0.2', 2)).toBe('192.0.2.1')
    expect(clientAddress('10.0.0.1', '192.0.2.1', 3)).toBe('192.0.2.1')
    expect(clientAddress('10.0.0.1', ' , ', 1)).toBe('10.0.0.1')
  })
})

describe('limitKey', () => {
  it('keeps IPv4 addresses and unknown values', () => {
    expect(limitKey('192.0.2.1')).toBe('192.0.2.1')
    expect(limitKey('::ffff:192.0.2.1')).toBe('192.0.2.1')
    expect(limitKey('unknown')).toBe('unknown')
  })

  it('returns the /64 network of an IPv6 address', () => {
    expect(limitKey('2001:db8:0001:0002:0003:0004:0005:0006')).toBe('2001:db8:1:2::/64')
    expect(limitKey('2001:DB8:1:2::abcd')).toBe('2001:db8:1:2::/64')
    expect(limitKey('2001:db8::1')).toBe('2001:db8:0:0::/64')
    expect(limitKey('::1')).toBe('0:0:0:0::/64')
    expect(limitKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64')
  })
})
