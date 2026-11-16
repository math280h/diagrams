import { readFile, writeFile } from 'node:fs/promises'
import type { BuildConfig } from '@/desktop/build-config'
import type { DesktopReportContext } from '@/desktop/contract'
import { compressDump, encodeBundle } from '@/reports/bundle'
import { encryptReport } from '@/reports/encrypt'
import { parseSentReports, reportFileName, sentReport, withSentReport, type SentReport } from '@/reports/history'
import { solveProof } from '@/reports/pow/solve'
import { REPORT_SIZE_LIMITS } from '@/reports/protocol'
import { reportSchema, type OperatingSystem } from '@/reports/report'
import { deleteReport, sendReport } from '@/reports/send'
import { writeFileAtomic } from '../storage/file-queue'
import { readJson, type CrashStore } from './crash-store'

const OPERATING_SYSTEMS: Partial<Record<NodeJS.Platform, OperatingSystem>> = {
  win32: 'windows',
  darwin: 'macos',
  linux: 'linux',
}

export interface ReporterOptions {
  reports: BuildConfig['reports']
  /** The JSON file of the reports that the app sent. */
  sentFile: string
  crashes: Pick<CrashStore, 'dumpFile'>
  fetch: typeof fetch
  /** Asks the user where to save a file, and returns the path, or `null` when the user cancels. */
  chooseFile: (defaultName: string) => Promise<string | null>
  version: string
  electron: string
  platform: NodeJS.Platform
  /** Returns the values that a report must not hold, such as the home folder and the agent token. */
  sensitive: () => string[]
  now?: () => number
}

/** Returns the main process side of problem reports: it encrypts, sends and saves reports, and keeps the sent list. */
export function createReporter(options: ReporterOptions) {
  const now = options.now ?? Date.now
  const { url, recipients } = options.reports

  const readSent = async () => parseSentReports(await readJson(options.sentFile), now())
  const writeSent = (list: readonly SentReport[]) => writeFileAtomic(options.sentFile, JSON.stringify(list))

  const encrypted = async (json: string, dumpOf: string | null) => {
    if (recipients.length === 0) throw new Error('This build has no keys to encrypt reports.')
    let value: unknown
    try {
      value = JSON.parse(json) as unknown
    } catch {
      throw new Error('The report is not valid JSON.')
    }
    const report = reportSchema.safeParse(value)
    if (!report.success) throw new Error('The report does not have the form of a problem report.')
    let dump: Uint8Array | null = null
    if (dumpOf !== null) {
      const file = await options.crashes.dumpFile(dumpOf)
      if (file === null) throw new Error('The crash dump of this crash is not on this computer any more.')
      dump = await compressDump(new Uint8Array(await readFile(file)))
    }
    const bytes = await encryptReport(encodeBundle({ json, dump }), recipients)
    return { bytes, report: report.data, withDump: dump !== null }
  }

  return {
    context: (): DesktopReportContext => ({
      version: options.version,
      electron: options.electron,
      os: OPERATING_SYSTEMS[options.platform] ?? 'other',
      sensitive: options.sensitive(),
    }),

    async send(json: string, dumpOf: string | null, signal?: AbortSignal): Promise<SentReport> {
      if (url === null) throw new Error('This build sends no reports. Save the report as a file instead.')
      const { bytes, report, withDump } = await encrypted(json, dumpOf)
      if (bytes.length > REPORT_SIZE_LIMITS.dump) {
        throw new Error('The report with the crash dump is too large to send. Save it as a file instead.')
      }
      const receipt = await sendReport({ endpoint: url, fetch: options.fetch, solve: solveProof }, bytes, signal)
      const sent = sentReport(receipt, { title: report.title, withDump, server: url }, now())
      await writeSent(withSentReport(await readSent(), sent, now())).catch(() => undefined)
      return sent
    },

    async save(json: string, dumpOf: string | null): Promise<{ saved: boolean }> {
      const { bytes } = await encrypted(json, dumpOf)
      const file = await options.chooseFile(reportFileName(now()))
      if (file === null) return { saved: false }
      await writeFile(file, bytes)
      return { saved: true }
    },

    sent: readSent,

    async deleteSent(id: string): Promise<SentReport[]> {
      const list = await readSent()
      const report = list.find((item) => item.id === id)
      if (report) await deleteReport({ endpoint: report.server, fetch: options.fetch }, report)
      const rest = list.filter((item) => item.id !== id)
      await writeSent(rest)
      return rest
    },
  }
}

export type Reporter = ReturnType<typeof createReporter>
