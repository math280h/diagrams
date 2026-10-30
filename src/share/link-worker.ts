import { errorMessage } from '@/lib/error-message'
import { type LinkJob, runLinkJob } from './link-job'

export type LinkReply = { ok: true; bytes: Uint8Array } | { ok: false; message: string }

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<LinkJob>) => void) | null
  postMessage(reply: LinkReply, transfer?: Transferable[]): void
}

scope.onmessage = (event) => {
  try {
    const bytes = runLinkJob(event.data)
    scope.postMessage({ ok: true, bytes }, [bytes.buffer])
  } catch (error) {
    scope.postMessage({ ok: false, message: errorMessage(error) }, [])
  }
}
