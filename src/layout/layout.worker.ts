import ELK from 'elkjs/lib/elk-api'
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url'
import { errorMessage } from '@/lib/error-message'
import { computeLayout } from './engine'
import type { LayoutRequest, LayoutResponse } from './types'

export type LayoutWorkerRequest = { id: number; request: LayoutRequest }
export type LayoutWorkerReply = { id: number; response: LayoutResponse } | { id: number; error: string }

interface WorkerScope {
  onmessage: ((event: MessageEvent<LayoutWorkerRequest>) => void) | null
  postMessage(message: LayoutWorkerReply, transfer: Transferable[]): void
}

const scope = self as unknown as WorkerScope
const elk = new ELK({ workerUrl: elkWorkerUrl })

scope.onmessage = (event) => {
  const { id, request } = event.data
  computeLayout(elk, request).then(
    (response) => scope.postMessage({ id, response }, []),
    (error: unknown) => scope.postMessage({ id, error: errorMessage(error) }, []),
  )
}
