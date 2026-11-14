import { serve } from '@hono/node-server'
import { errorMessage } from '@/lib/error-message'
import { createApp } from './app'
import { readConfig, type ServerConfig } from './config'
import { keepRetention } from './retention'
import { createProof, createStore } from './setup'

let config: ServerConfig
try {
  config = readConfig(process.env)
} catch (error) {
  console.error(errorMessage(error))
  process.exit(1)
}

const store = createStore(config)
const app = createApp({ config, store, proof: createProof(config) })
const stopRetention = keepRetention(store, config.retentionMs, (message) =>
  console.error(`Could not delete old reports: ${message}`),
)
const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(
    `Report server on port ${info.port}, storage ${config.storage.kind}, proof of work ${config.pow.provider}.`,
  )
})

function stop() {
  stopRetention()
  server.close(() => process.exit(0))
}

process.on('SIGTERM', stop)
process.on('SIGINT', stop)
