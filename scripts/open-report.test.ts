import { describe, expect, it } from 'vitest'
import { printable, readIdentities, reportFolderName } from './open-report.ts'

describe('readIdentities', () => {
  it('reads the identities and skips comments and other lines', () => {
    const text = [
      '# created: 2026-11-12T10:00:00Z',
      '# public key: age1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqs3290gq',
      'AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ',
      'AGE-SECRET-KEY-PQ-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ',
      'not a key',
    ].join('\r\n')
    expect(readIdentities(text)).toHaveLength(2)
  })
})

describe('printable', () => {
  it('removes terminal control characters and hidden direction marks', () => {
    expect(printable('Title\u001b[2J\u0007 with ‮evil‬ text\nnext')).toBe('Title[2J with evil text\nnext')
  })
})

describe('reportFolderName', () => {
  it('uses the report id, or a safe name that stays inside the output folder', () => {
    expect(reportFolderName(`/reports/${'a'.repeat(32)}.age`)).toBe('a'.repeat(32))
    expect(reportFolderName('../../etc/passwd.age')).toBe('passwd')
    expect(reportFolderName('..age')).toBe('_')
    expect(reportFolderName('my report (1).age')).toBe('my_report_1_')
  })
})
