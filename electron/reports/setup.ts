import path from 'node:path'
import { app, crashReporter, dialog, net, shell } from 'electron'
import { BUILD } from '@/desktop/build-config'
import type { CrashRecord } from '@/desktop/contract'
import type { MainHandlers } from '../ipc'
import { createCrashStore, isCrashReason } from './crash-store'
import { createReporter } from './reporter'

const REPORTS_FOLDER = 'reports'
const CRASH_DUMPS_FOLDER = 'Crashpad'

export type ReportHandlers = Pick<MainHandlers, Extract<keyof MainHandlers, `reports.${string}`>>

/** Starts the crash reporter of Electron. It keeps crash dumps in the user data folder and sends nothing. */
export function startCrashReporter() {
  app.setPath('crashDumps', path.join(app.getPath('userData'), CRASH_DUMPS_FOLDER))
  crashReporter.start({ uploadToServer: false })
}

function processName(type: string): string {
  return type.toLowerCase().replace(/\s+/g, '-')
}

function netFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  return net.fetch(input instanceof URL ? input.toString() : input, init)
}

export interface ReportsOptions {
  userData: string
  /** Returns the values that a report must not hold, such as the home folder and the agent token. */
  sensitive: () => string[]
  /** Sends the kept crashes to the renderer after the app recorded a crash. */
  emitCrashes: (crashes: CrashRecord[]) => void
  saveDialogParent: () => Electron.BaseWindow | null
}

/** Records the crashes of the app, and returns the handlers of the report requests of the renderer. */
export function setupReports(options: ReportsOptions): ReportHandlers {
  const folder = path.join(options.userData, REPORTS_FOLDER)
  const crashes = createCrashStore({
    logFile: path.join(folder, 'crashes.json'),
    dumpsFolder: app.getPath('crashDumps'),
    sessionFile: path.join(folder, 'session.json'),
  })
  const reporter = createReporter({
    reports: BUILD.reports,
    sentFile: path.join(folder, 'sent.json'),
    crashes,
    fetch: netFetch,
    chooseFile: async (defaultName) => {
      const parent = options.saveDialogParent()
      const settings = {
        title: 'Save the encrypted report',
        defaultPath: path.join(app.getPath('downloads'), defaultName),
        filters: [{ name: 'Encrypted reports', extensions: ['age'] }],
      }
      const picked = parent ? await dialog.showSaveDialog(parent, settings) : await dialog.showSaveDialog(settings)
      return picked.canceled || !picked.filePath ? null : picked.filePath
    },
    version: app.getVersion(),
    electron: process.versions.electron ?? '',
    platform: process.platform,
    sensitive: options.sensitive,
  })

  void crashes.startSession().catch(() => undefined)
  app.on('will-quit', () => crashes.endSession())
  const record = (process: string, details: { reason: string; exitCode: number }) => {
    if (!isCrashReason(details.reason)) return
    void crashes
      .record({ process, reason: details.reason, exitCode: details.exitCode })
      .then(options.emitCrashes, () => undefined)
  }
  app.on('render-process-gone', (_event, _contents, details) => record('renderer', details))
  app.on('child-process-gone', (_event, details) => record(processName(details.type), details))

  let sending: AbortController | null = null
  return {
    'reports.context': async () => reporter.context(),
    'reports.crashes': () => crashes.list(),
    'reports.markSeen': () => crashes.markSeen(),
    'reports.showDump': async ({ id }) => {
      const file = await crashes.dumpFile(id)
      if (file === null) throw new Error('This crash has no crash dump on this computer.')
      shell.showItemInFolder(file)
      return null
    },
    'reports.deleteCrash': ({ id }) => crashes.remove(id),
    'reports.send': async ({ json, dumpOf }) => {
      const controller = new AbortController()
      sending = controller
      try {
        return await reporter.send(json, dumpOf, controller.signal)
      } finally {
        if (sending === controller) sending = null
      }
    },
    'reports.cancelSend': async () => {
      sending?.abort()
      return null
    },
    'reports.save': ({ json, dumpOf }) => reporter.save(json, dumpOf),
    'reports.sent': () => reporter.sent(),
    'reports.deleteSent': ({ id }) => reporter.deleteSent(id),
  }
}
