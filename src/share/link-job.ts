import DICTIONARY from './link-dictionary.txt?raw'
import { compress, decompress } from './link-model'

export type LinkJob = { kind: 'compress'; bytes: Uint8Array } | { kind: 'decompress'; bytes: Uint8Array; size: number }

let dictionary: Uint8Array | null = null

/** Runs one job of the share link codec with the link dictionary. */
export function runLinkJob(job: LinkJob): Uint8Array {
  dictionary ??= new TextEncoder().encode(DICTIONARY)
  return job.kind === 'compress' ? compress(job.bytes, dictionary) : decompress(job.bytes, dictionary, job.size)
}
