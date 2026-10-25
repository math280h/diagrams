import { desktopApi } from './bridge'
import type { RendererRequests } from './contract'

export type RendererHandlers = {
  [M in keyof RendererRequests]: (
    input: RendererRequests[M]['input'],
    signal: AbortSignal,
  ) => Promise<RendererRequests[M]['output']>
}

/**
 * Answers requests from the main process, and aborts a handler when main cancels its request.
 *
 * @returns A function that stops the answers.
 */
export function serveMainRequests(handlers: RendererHandlers): () => void {
  const desktop = desktopApi()
  if (!desktop) return () => undefined
  const controllers = new Map<string, AbortController>()
  const stopCancel = desktop.on('rpc.cancel', ({ requestId }) => controllers.get(requestId)?.abort())
  const stopServe = desktop.serve(async (call) => {
    const controller = new AbortController()
    controllers.set(call.requestId, controller)
    try {
      const handler = handlers[call.method] as (input: unknown, signal: AbortSignal) => Promise<unknown>
      return await handler(call.input, controller.signal)
    } finally {
      controllers.delete(call.requestId)
    }
  })
  desktop.ready()
  return () => {
    stopCancel()
    stopServe()
  }
}
