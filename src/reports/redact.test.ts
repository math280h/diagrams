import { describe, expect, it } from 'vitest'
import { createRedactor, REMOVED } from './redact'

const redact = createRedactor()

describe('createRedactor', () => {
  it.each([
    ['data URLs', 'image data:image/png;base64,iVBORw0KGgo= failed', `image ${REMOVED.data} failed`],
    ['web addresses', 'GET https://example.com/a?b=c failed', `GET ${REMOVED.address} failed`],
    ['file addresses', 'open file:///C:/Users/ana/x.json', `open ${REMOVED.address}`],
    ['custom schemes', 'load app://diagrams/index.html', `load ${REMOVED.address}`],
    ['email addresses', 'mail ana.lima+test@example.co.uk now', `mail ${REMOVED.email} now`],
    ['Windows paths', 'read C:\\Users\\ana\\Documents\\a.json', `read ${REMOVED.path}`],
    ['Windows paths with spaces', 'read C:\\Users\\Ana Lima\\a b\\c.json failed', `read ${REMOVED.path} failed`],
    ['Windows paths with forward slashes', 'read d:/work/a.json', `read ${REMOVED.path}`],
    ['network paths', 'read \\\\server\\share\\a.json', `read ${REMOVED.path}`],
    ['POSIX paths', 'read /home/ana/Diagrams/a.json', `read ${REMOVED.path}`],
    ['POSIX paths with spaces', 'read /Users/Ana Lima/Diagrams/a.json', `read ${REMOVED.path}`],
    ['home paths', 'read ~/Diagrams/a.json', `read ${REMOVED.path}`],
    ['IPv4 addresses', 'connect 192.168.1.20 failed', `connect ${REMOVED.address} failed`],
    ['full IPv6 addresses', 'from 2001:0db8:0000:0000:0000:ff00:0042:8329', `from ${REMOVED.address}`],
    [
      'compressed IPv6 addresses',
      'from 2001:db8::1 and fe80::1ff:fe23:4567:890a',
      `from ${REMOVED.address} and ${REMOVED.address}`,
    ],
    ['UUIDs', 'id 123e4567-e89b-12d3-a456-426614174000', `id ${REMOVED.id}`],
    ['app ids', 'diagram d_vpdoc8peen not found', `diagram ${REMOVED.id} not found`],
    ['long tokens', 'token 3f9a8b7c6d5e4f3a2b1c0d9e8f7a', `token ${REMOVED.token}`],
  ])('removes %s', (_kind, text, expected) => {
    expect(redact(text)).toBe(expected)
  })

  it.each([
    ['loopback IPv4 addresses', 'connect 127.0.0.1:27419 failed'],
    ['the loopback IPv6 address', 'connect ::1 failed'],
    ['times', 'at 2026-11-12 10:00:00 the save failed'],
    ['line and column numbers', 'index-a1b2.js:12:34'],
    ['package versions', 'zod@4.6.7 failed'],
    ['API paths with one part', 'GET /health'],
    ['short words with numbers', 'HTTP 503 from v1'],
    ['C++ names', 'std::vector failed'],
  ])('keeps %s', (_kind, text) => {
    expect(redact(text)).toBe(text)
  })

  it('removes each sensitive value first, the longest first, also with forward slashes', () => {
    const withValues = createRedactor(['/srv/ana', 'Secret plan', 'Secret', 'ab'])
    expect(withValues('\\srv\\ana and Secret plan and Secret and ab')).toBe(
      `${REMOVED.text} and ${REMOVED.text} and ${REMOVED.text} and ab`,
    )
  })

  it('removes the rest of a path after a sensitive folder', () => {
    const withHome = createRedactor(['C:\\Users\\Ana Lima', '/home/ana'])
    expect(withHome('open C:\\Users\\Ana Lima\\My files\\plan.json failed')).toBe(`open ${REMOVED.path} failed`)
    expect(withHome('open /home/ana/plan.json failed')).toBe(`open ${REMOVED.path} failed`)
  })

  it('removes a sensitive value only as a whole word', () => {
    const withName = createRedactor(['ana', 'Åse'])
    expect(withName('ana saw a banana, Åse and BÅse')).toBe(`${REMOVED.text} saw a banana, ${REMOVED.text} and BÅse`)
  })

  it('removes values with characters of regular expressions as plain text', () => {
    expect(createRedactor(['a+b (c)'])('x a+b (c) y')).toBe(`x ${REMOVED.text} y`)
  })

  it('cuts long texts', () => {
    const result = redact('word '.repeat(1000))
    expect(result).toHaveLength(2001)
    expect(result.endsWith('…')).toBe(true)
  })
})
