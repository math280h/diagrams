import { BUILD } from '@/desktop/build-config'
import { desktopApi } from '@/desktop/bridge'
import { downloadBlob } from '@/lib/download'
import { parseSentReports, reportFileName, sentReport, withSentReport, type SentReport } from './history'
import { abortError } from './pow/abort'
import type { ProofReply } from './pow/pow-worker'
import type { ChallengeResponse } from './protocol'
import { reportSchema } from './report'
import { deleteReport, sendReport } from './send'

/** Where the app sends, saves and lists problem reports: the browser on the website, the main process on the desktop. */
export interface ReportBackend {
  /** True when this build has a report server. A build with one always has keys. */
  canSend: boolean
  /** True when this build has keys to encrypt a report file. */
  canEncrypt: boolean
  /**
   * Encrypts and sends a report.
   *
   * @param dumpOf - The id of the crash whose crash dump goes with the report, or `null` for no dump.
   */
  send(json: string, dumpOf: string | null, signal: AbortSignal): Promise<SentReport>
  /** Encrypts a report and saves it as a file. Returns false when the user cancels. */
  saveEncrypted(json: string, dumpOf: string | null): Promise<boolean>
  sentReports(): Promise<SentReport[]>
  /** Deletes a sent report from the report server and from the list. */
  deleteSent(id: string): Promise<SentReport[]>
}

const { url, recipients } = BUILD.reports
const SENT_REPORTS_KEY = 'dg:sent-reports'

function readSent(now: number): SentReport[] {
  try {
    return parseSentReports(JSON.parse(localStorage.getItem(SENT_REPORTS_KEY) ?? 'null'), now)
  } catch {
    return []
  }
}

function writeSent(list: readonly SentReport[]) {
  try {
    localStorage.setItem(SENT_REPORTS_KEY, JSON.stringify(list))
  } catch {
    // Browsers throw when the storage is full or blocked, for example in a private window.
  }
}

function browserFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, init)
}

function solveInWorker(challenge: ChallengeResponse, signal?: AbortSignal): Promise<string | null> {
  if (challenge.provider === 'none') return Promise.resolve(null)
  const worker = new Worker(new URL('./pow/pow-worker.ts', import.meta.url), { type: 'module', name: 'proof-of-work' })
  return new Promise<string | null>((resolve, reject) => {
    const stop = () => reject(abortError())
    if (signal?.aborted) stop()
    signal?.addEventListener('abort', stop, { once: true })
    worker.onmessage = (event: MessageEvent<ProofReply>) =>
      event.data.ok ? resolve(event.data.proof) : reject(new Error(event.data.message))
    worker.onerror = (event) => reject(new Error(event.message || 'The proof of work stopped.'))
    worker.postMessage(challenge, [])
  }).finally(() => worker.terminate())
}

async function encrypted(json: string) {
  const [{ encodeBundle }, { encryptReport }] = await Promise.all([import('./bundle'), import('./encrypt')])
  return encryptReport(encodeBundle({ json, dump: null }), recipients)
}

function webBackend(): ReportBackend {
  return {
    canSend: url !== null,
    canEncrypt: recipients.length > 0,
    async send(json, _dumpOf, signal) {
      if (url === null) throw new Error('This build sends no reports.')
      const report = reportSchema.parse(JSON.parse(json))
      const bytes = await encrypted(json)
      const receipt = await sendReport({ endpoint: url, fetch: browserFetch, solve: solveInWorker }, bytes, signal)
      const now = Date.now()
      const sent = sentReport(receipt, { title: report.title, withDump: false, server: url }, now)
      writeSent(withSentReport(readSent(now), sent, now))
      return sent
    },
    async saveEncrypted(json) {
      downloadBlob(new Blob([await encrypted(json)], { type: 'application/octet-stream' }), reportFileName(Date.now()))
      return true
    },
    async sentReports() {
      return readSent(Date.now())
    },
    async deleteSent(id) {
      const list = readSent(Date.now())
      const report = list.find((item) => item.id === id)
      if (report) await deleteReport({ endpoint: report.server, fetch: browserFetch }, report)
      const rest = list.filter((item) => item.id !== id)
      writeSent(rest)
      return rest
    },
  }
}

function desktopBackend(api: NonNullable<ReturnType<typeof desktopApi>>): ReportBackend {
  return {
    canSend: url !== null,
    canEncrypt: recipients.length > 0,
    async send(json, dumpOf, signal) {
      const cancel = () => void api.request('reports.cancelSend', null).catch(() => undefined)
      signal.addEventListener('abort', cancel, { once: true })
      return api.request('reports.send', { json, dumpOf }).finally(() => signal.removeEventListener('abort', cancel))
    },
    saveEncrypted: async (json, dumpOf) => (await api.request('reports.save', { json, dumpOf })).saved,
    sentReports: () => api.request('reports.sent', null),
    deleteSent: (id) => api.request('reports.deleteSent', { id }),
  }
}

let backend: ReportBackend | null = null

/** Returns the report backend of this app. */
export function reportBackend(): ReportBackend {
  const api = desktopApi()
  backend ??= api ? desktopBackend(api) : webBackend()
  return backend
}
