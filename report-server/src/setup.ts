import type { ServerConfig } from './config'
import { altchaProof } from './pow/altcha'
import { capProof } from './pow/cap'
import { noProof } from './pow/none'
import type { ProofProvider } from './pow/provider'
import { createFsStore } from './storage/fs-store'
import { createS3Store } from './storage/s3-store'
import type { ReportStore } from './storage/store'

/** Returns the store of the configuration. */
export function createStore(config: ServerConfig): ReportStore {
  return config.storage.kind === 's3' ? createS3Store(config.storage) : createFsStore(config.storage.dir)
}

/** Returns the proof-of-work provider of the configuration. */
export function createProof(config: ServerConfig): ProofProvider {
  switch (config.pow.provider) {
    case 'none':
      return noProof()
    case 'altcha':
      return altchaProof(config.pow.secret)
    case 'cap':
      return capProof(config.pow.secret)
  }
}
