import { toast } from 'sonner'
import { createBrowserContext } from '@/agent/browser-context'
import { runAgentTool } from '@/agent/runtime'
import { repository } from '@/persistence/active-repository'
import { parseDiagramJson } from '@/persistence/library-actions'
import { untilStored } from '@/persistence/until-stored'
import { createAndOpenBlankDiagram, openPickedDiagramFiles } from '@/library/library-commands'
import { watchCrashes } from '@/reports/crashes'
import { openProblemReports } from '@/reports/report-store'
import { router } from '@/router'
import { serializeDiagram } from '@/persistence/cached-repository'
import { currentDiagram, saveAndSettle } from '@/store/document'
import { setUi } from '@/store/ui-store'
import { useUnsaved } from '@/store/unsaved'
import { openConnectAgent, recordAgentCall, watchAgentInfo } from './agent-store'
import { loadAppSettings } from './app-settings'
import { desktopApi } from './bridge'
import type { MenuCommand } from './contract'
import { watchGitHubSignIn } from './github-sign-in'
import { runMenuEdit } from './menu-edit'
import { serveMainRequests } from './serve'
import { openDesktopSettings } from './settings-dialog'
import { checkForUpdates, watchUpdates } from './updates'

const ONLY_IN_CAPTURE_WINDOW = 'Only the capture window renders export stages.'

const openDiagram = (diagramId: string) => void router.navigate({ to: '/d/$diagramId', params: { diagramId } })

const MENU_COMMANDS: Record<MenuCommand, () => void> = {
  settings: openDesktopSettings,
  'check-for-updates': () => void checkForUpdates(),
  'new-diagram': () => createAndOpenBlankDiagram(openDiagram),
  'open-files': () => openPickedDiagramFiles(openDiagram),
  shortcuts: () => setUi({ shortcutsOpen: true }),
  'problem-reports': openProblemReports,
}

function reportUnsaved() {
  const report = (unsaved: boolean) =>
    void desktopApi()
      ?.request('app.setUnsaved', { unsaved })
      .catch(() => undefined)
  let reported = useUnsaved.getState().diagram !== null
  report(reported)
  useUnsaved.subscribe(({ diagram }) => {
    if ((diagram !== null) === reported) return
    reported = diagram !== null
    report(reported)
  })
}

/**
 * Answers the requests of the desktop main process: agent tools, browser handoffs and the save before close.
 *
 * @param storageError - Why the diagrams folder did not load, or `null`. With an error, agent calls and handoffs fail
 *   at once with that reason.
 */
export function startDesktopRuntime(storageError: string | null = null) {
  watchAgentInfo()
  watchUpdates()
  watchGitHubSignIn()
  watchCrashes()
  loadAppSettings()
  reportUnsaved()
  const unavailable = `The app could not open the diagrams folder: ${storageError}`
  return serveMainRequests({
    'agent.call': async ({ tool, args }, signal) => {
      if (storageError !== null) return { ok: false, message: unavailable }
      recordAgentCall()
      return runAgentTool(tool, args, signal, createBrowserContext)
    },

    'handoff.open': async ({ text }) => {
      if (storageError !== null) throw new Error(unavailable)
      const diagram = parseDiagramJson(text)
      const failure = await untilStored(diagram.id, () => repository().save(diagram))
      if (failure !== null) throw new Error(failure)
      await router.navigate({ to: '/d/$diagramId', params: { diagramId: diagram.id } })
      toast.success(diagram.name ? `Opened “${diagram.name}” from the browser` : 'Opened the diagram from the browser')
      return { diagramId: diagram.id, name: diagram.name }
    },

    'render.file': async (request) => {
      const [{ renderDiagramFile }, { blobToBase64 }] = await Promise.all([
        import('@/export/render-file'),
        import('@/export/render-image'),
      ])
      return { data: await blobToBase64(await renderDiagramFile(request)) }
    },

    'app.flush': async () => {
      if (storageError !== null) return { unsaved: null }
      if ((await saveAndSettle()) === null) return { unsaved: null }
      const diagram = currentDiagram()
      return { unsaved: { name: diagram.name, text: serializeDiagram(diagram) } }
    },

    'app.connectAgent': async () => {
      openConnectAgent()
      return null
    },

    'menu.command': async ({ command }) => {
      MENU_COMMANDS[command]()
      return null
    },

    'menu.edit': async ({ command }) => ({ handled: runMenuEdit(command) }),

    'capture.mount': () => Promise.reject(new Error(ONLY_IN_CAPTURE_WINDOW)),
    'capture.render': () => Promise.reject(new Error(ONLY_IN_CAPTURE_WINDOW)),
  })
}
