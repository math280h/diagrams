import ELK from 'elkjs/lib/elk-api'
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url'
import { errorMessage } from '@/lib/error-message'
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
  | { kind: 'layout'; id: number; error: string }
  | { kind: 'graphviz'; call: number; dot: string; engine: GraphvizEngine }

interface WorkerScope {
  onmessage: ((event: MessageEvent<LayoutWorkerRequest>) => void) | null
  postMessage(message: LayoutWorkerReply, transfer: Transferable[]): void
}

const scope = self as unknown as WorkerScope
const elk = new ELK({ workerUrl: elkWorkerUrl })
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
  computeLayout(elk, request, message.graphvizOnPage ? graphvizOnPage : graphvizWasm).then(
    (response) => scope.postMessage({ kind: 'layout', id, response }, []),
    (error: unknown) => scope.postMessage({ kind: 'layout', id, error: errorMessage(error) }, []),
  )
}
