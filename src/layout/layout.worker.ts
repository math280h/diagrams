import ELK from 'elkjs/lib/elk-api'
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url'
import { errorMessage } from '@/lib/error-message'
import { FileLoadError, isFileLoadError, workerError } from '@/new-version/file-load'
import { computeLayout } from './engine'
import { graphvizWasm, type GraphvizRunner } from './graphviz'
import type { GraphvizEngine, LayoutRequest, LayoutResponse } from './types'

export type LayoutWorkerRequest =
  | {
      kind: 'layout'
      id: number
      request: LayoutRequest
      /** If true, the page runs Graphviz, so that the worker does not compile WebAssembly. */
      graphvizOnPage: boolean
    }
  | { kind: 'graphviz'; call: number; plain: string }
  | { kind: 'graphviz'; call: number; error: string }

export type LayoutWorkerReply =
  | { kind: 'layout'; id: number; response: LayoutResponse }
  /** `fileMissing` is true when a file of the layout engine did not load. */
  | { kind: 'layout'; id: number; error: string; fileMissing: boolean }
  | { kind: 'graphviz'; call: number; dot: string; engine: GraphvizEngine }

interface WorkerScope {
  onmessage: ((event: MessageEvent<LayoutWorkerRequest>) => void) | null
  postMessage(message: LayoutWorkerReply, transfer: Transferable[]): void
}

const scope = self as unknown as WorkerScope
let elkNotLoaded: (error: Error) => void = () => undefined
const elkFailure = new Promise<never>((_resolve, reject) => {
  elkNotLoaded = reject
})
elkFailure.catch(() => undefined)
const elk = new ELK({
  workerUrl: elkWorkerUrl,
  workerFactory: (url) => {
    const worker = new Worker(url ?? elkWorkerUrl)
    // elkjs does not reject its calls when the script of its worker does not load.
    worker.addEventListener('error', (event) => {
      const error = workerError(event, 'The ELK worker stopped.', 'The ELK worker did not load.')
      if (error instanceof FileLoadError) elkNotLoaded(error)
    })
    return worker
  },
})
const calls = new Map<number, { resolve: (plain: string) => void; reject: (error: Error) => void }>()
let nextCall = 0

const graphvizOnPage: GraphvizRunner = (dot, engine) =>
  new Promise((resolve, reject) => {
    const call = nextCall++
    calls.set(call, { resolve, reject })
    scope.postMessage({ kind: 'graphviz', call, dot, engine }, [])
  })

scope.onmessage = (event) => {
  const message = event.data
  if (message.kind === 'graphviz') {
    const waiting = calls.get(message.call)
    calls.delete(message.call)
    if ('error' in message) waiting?.reject(new Error(message.error))
    else waiting?.resolve(message.plain)
    return
  }
  const { id, request } = message
  Promise.race([computeLayout(elk, request, message.graphvizOnPage ? graphvizOnPage : graphvizWasm), elkFailure]).then(
    (response) => scope.postMessage({ kind: 'layout', id, response }, []),
    (error: unknown) =>
      scope.postMessage({ kind: 'layout', id, error: errorMessage(error), fileMissing: isFileLoadError(error) }, []),
  )
}
