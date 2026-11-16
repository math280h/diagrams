import { describe, expect, it } from 'vitest'
import {
  MAX_SENT_REPORTS,
  parseSentReports,
  reportFileName,
  sentReport,
  withSentReport,
  type SentReport,
} from './history'

function sent(id: number, expiresAt = 1000): SentReport {
  return {
    id: id.toString(16).padStart(32, '0'),
    deleteToken: 'A'.repeat(43),
    expiresAt,
    sentAt: 0,
    title: `Report ${id}`,
    withDump: false,
    server: 'https://reports.example',
  }
}

describe('withSentReport', () => {
  it('puts the report first and drops reports that the server deleted already', () => {
    const list = [sent(1, 500), sent(2, 50)]
    expect(withSentReport(list, sent(3), 100).map((report) => report.title)).toEqual(['Report 3', 'Report 1'])
  })

  it('keeps one entry for each id, and at most 50', () => {
    const list = Array.from({ length: MAX_SENT_REPORTS }, (_, index) => sent(index + 1))
    const result = withSentReport(list, sent(1), 0)
    expect(result).toHaveLength(MAX_SENT_REPORTS)
    expect(result.filter((report) => report.id === sent(1).id)).toHaveLength(1)
    expect(withSentReport(list, sent(99), 0)).toHaveLength(MAX_SENT_REPORTS)
  })
})

describe('parseSentReports', () => {
  it('keeps the reports that the server keeps still, and reads nothing from a value of another form', () => {
    expect(parseSentReports([sent(1, 500), sent(2, 50)], 100)).toEqual([sent(1, 500)])
    expect(parseSentReports({ reports: [] }, 100)).toEqual([])
    expect(parseSentReports(null, 100)).toEqual([])
  })
})

describe('sentReport', () => {
  it('adds the title, the dump flag, the server and the time to a receipt', () => {
    const receipt = { id: 'a'.repeat(32), deleteToken: 'B'.repeat(43), expiresAt: 9 }
    expect(sentReport(receipt, { title: 'T', withDump: true, server: 'https://r.example' }, 5)).toEqual({
      ...receipt,
      title: 'T',
      withDump: true,
      server: 'https://r.example',
      sentAt: 5,
    })
  })
})

describe('reportFileName', () => {
  it('names the file with the day in UTC', () => {
    expect(reportFileName(Date.parse('2026-11-12T23:30:00Z'))).toBe('diagrams-report-2026-11-12.age')
  })
})
