import type { LinkJob } from './link-job'
import type { LinkReply } from './link-worker'

async function run(job: LinkJob): Promise<Uint8Array> {
  if (typeof Worker === 'undefined') return (await import('./link-job')).runLinkJob(job)
  const worker = new Worker(new URL('./link-worker.ts', import.meta.url), { type: 'module' })
  try {
    return await new Promise<Uint8Array>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<LinkReply>) =>
        event.data.ok ? resolve(event.data.bytes) : reject(new Error(event.data.message))
      worker.onerror = (event) => reject(new Error(event.message || 'The link codec stopped.'))
      worker.postMessage(job, [])
    })
  } finally {
    worker.terminate()
  }
}

/** Compresses the JSON of a share link off the main thread, where the browser has workers. */
export function compressLink(json: Uint8Array): Promise<Uint8Array> {
  return run({ kind: 'compress', bytes: json })
}

/** Returns the `size` bytes of JSON that {@link compressLink} coded. */
export function decompressLink(packed: Uint8Array, size: number): Promise<Uint8Array> {
  return run({ kind: 'decompress', bytes: packed, size })
}
