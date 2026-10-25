import { toast } from 'sonner'
import { createBrowserContext } from '@/agent/browser-context'
import { runAgentTool } from '@/agent/runtime'
import { repository } from '@/persistence/active-repository'
import { parseDiagramJson } from '@/persistence/library-actions'
import { untilStored } from '@/persistence/until-stored'
import { router } from '@/router'
import { flushPendingSave } from '@/store/document'
import { recordAgentCall, watchAgentInfo } from './agent-store'
import { serveMainRequests } from './serve'
import { watchUpdates } from './updates'

/**
 * Answers the requests of the desktop main process: agent tools, browser handoffs and the save before close.
 *
 * @param storageError - Why the diagrams folder did not load, or `null`. With an error, agent calls and handoffs fail
 *   at once with that reason.
 */
export function startDesktopRuntime(storageError: string | null = null) {
  watchAgentInfo()
  watchUpdates()
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

    'app.flush': async () => {
      if (storageError !== null) return null
      flushPendingSave()
      await repository().settled()
      return null
    },
  })
}
