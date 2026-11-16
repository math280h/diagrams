import { z } from '@/lib/zod'
import { DELETE_TOKEN, REPORT_ID, type Receipt } from './protocol'

/** A report that this device sent, with what it needs to delete the report from the server. */
export const sentReportSchema = z.object({
  id: z.string().regex(REPORT_ID),
  deleteToken: z.string().regex(DELETE_TOKEN),
  /** The time when the server deletes the report, in milliseconds since 1970. */
  expiresAt: z.number(),
  sentAt: z.number(),
  title: z.string(),
  withDump: z.boolean(),
  /** The base address of the report server. */
  server: z.string(),
})
export type SentReport = z.infer<typeof sentReportSchema>

export const MAX_SENT_REPORTS = 50

const sentListSchema = z.array(sentReportSchema)

/** Returns the name of a saved report file, with the day of `time` in UTC. */
export function reportFileName(time: number): string {
  return `diagrams-report-${new Date(time).toISOString().slice(0, 10)}.age`
}

/** Returns the sent reports in a stored value that the server keeps still, or none for a value of another form. */
export function parseSentReports(value: unknown, now: number): SentReport[] {
  const parsed = sentListSchema.safeParse(value)
  return parsed.success ? parsed.data.filter((report) => report.expiresAt > now) : []
}

/** Returns the entry of the sent list for the receipt of a report. */
export function sentReport(
  receipt: Receipt,
  report: { title: string; withDump: boolean; server: string },
  now: number,
): SentReport {
  return { ...receipt, ...report, sentAt: now }
}

/** Returns the list with the report first, without reports that the server deleted already, at most 50. */
export function withSentReport(list: readonly SentReport[], report: SentReport, now: number): SentReport[] {
  return [report, ...list.filter((item) => item.id !== report.id && item.expiresAt > now)].slice(0, MAX_SENT_REPORTS)
}
