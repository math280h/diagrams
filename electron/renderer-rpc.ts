import { randomUUID } from 'node:crypto'
import { ipcMain, type WebContents } from 'electron'
import {
  IPC_CHANNELS,
  type MainEvents,
  type RendererCall,
  type RendererReply,
  type RendererRequests,
} from '@/desktop/contract'

const READY_TIMEOUT_MS = 20_000

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  cleanup: () => void
}

/** Sends requests and events to the renderer of one window and matches each reply to its request. */
export function createRendererRpc() {
  let contents: WebContents | null = null
  let ready = false
  const readyWaiters = new Set<() => void>()
  const pending = new Map<string, Pending>()

  const rejectAll = (message: string) => {
    for (const [requestId, call] of pending) {
      call.cleanup()
      pending.delete(requestId)
      call.reject(new Error(message))
    }
  }

  ipcMain.on(IPC_CHANNELS.ready, (event) => {
    if (event.sender !== contents) return
    ready = true
    for (const waiter of readyWaiters) waiter()
    readyWaiters.clear()
  })

  ipcMain.on(IPC_CHANNELS.reply, (event, reply: RendererReply) => {
    if (event.sender !== contents) return
    const call = pending.get(reply.requestId)
    if (!call) return
    pending.delete(reply.requestId)
    call.cleanup()
    if (reply.ok) call.resolve(reply.value)
    else call.reject(new Error(reply.message))
  })

  const whenReady = (timeoutMs: number, signal?: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      if (ready && contents) return resolve()
      if (signal?.aborted) return reject(new Error('The request was cancelled.'))
      const stop = () => {
        clearTimeout(timer)
        readyWaiters.delete(done)
        signal?.removeEventListener('abort', onAbort)
      }
      const timer = setTimeout(() => {
        stop()
        reject(new Error('The app window did not start in time.'))
      }, timeoutMs)
      const onAbort = () => {
        stop()
        reject(new Error('The request was cancelled.'))
      }
      const done = () => {
        stop()
        resolve()
      }
      readyWaiters.add(done)
      signal?.addEventListener('abort', onAbort, { once: true })
    })

  const emit = <E extends keyof MainEvents>(name: E, payload: MainEvents[E]) => {
    if (contents && !contents.isDestroyed()) contents.send(IPC_CHANNELS.event, { name, payload })
  }

  return {
    /** Connects the RPC to the renderer of a window. Navigation or a crash rejects the open calls. */
    attach(next: WebContents) {
      contents = next
      ready = false
      next.on('did-start-navigation', (details) => {
        if (!details.isMainFrame || details.isSameDocument) return
        ready = false
        rejectAll('The app window reloaded.')
      })
      next.on('render-process-gone', () => {
        ready = false
        rejectAll('The app window stopped.')
      })
      next.once('destroyed', () => {
        if (contents !== next) return
        contents = null
        ready = false
        rejectAll('The app window closed.')
      })
    },

    emit,

    /**
     * Sends a request to the renderer and resolves with its answer.
     *
     * @param options.timeoutMs - The time limit of the whole call, with the wait for the renderer to start.
     */
    async call<M extends keyof RendererRequests>(
      method: M,
      input: RendererRequests[M]['input'],
      options: { timeoutMs: number; signal?: AbortSignal },
    ): Promise<RendererRequests[M]['output']> {
      const deadline = Date.now() + options.timeoutMs
      await whenReady(Math.min(READY_TIMEOUT_MS, options.timeoutMs), options.signal)
      const target = contents
      if (!target || target.isDestroyed()) throw new Error('The app window is closed.')
      if (options.signal?.aborted) throw new Error('The request was cancelled.')
      const requestId = randomUUID()
      return new Promise((resolve, reject) => {
        const cancel = (message: string) => {
          if (!pending.has(requestId)) return
          pending.get(requestId)?.cleanup()
          pending.delete(requestId)
          emit('rpc.cancel', { requestId })
          reject(new Error(message))
        }
        const timer = setTimeout(
          () => cancel(`The app did not answer within ${options.timeoutMs} ms.`),
          Math.max(0, deadline - Date.now()),
        )
        const onAbort = () => cancel('The request was cancelled.')
        options.signal?.addEventListener('abort', onAbort, { once: true })
        pending.set(requestId, {
          resolve: resolve as (value: unknown) => void,
          reject,
          cleanup: () => {
            clearTimeout(timer)
            options.signal?.removeEventListener('abort', onAbort)
          },
        })
        const call: RendererCall<M> = { requestId, method, input }
        target.send(IPC_CHANNELS.call, call)
      })
    },
  }
}
