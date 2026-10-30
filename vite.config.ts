import { fileURLToPath, URL } from 'node:url'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { releaseNotes } from './scripts/release-notes.ts'
import { serviceWorker } from './scripts/service-worker.ts'
import { standalonePlayer } from './scripts/standalone-player.ts'
import { thirdPartyLicenses } from './scripts/third-party-licenses.ts'

const licenses = thirdPartyLicenses()

export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    licenses.main,
    standalonePlayer(),
    releaseNotes(),
    serviceWorker(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  worker: { format: 'es', plugins: () => [licenses.worker()] },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    warmup: {
      clientFiles: [
        './src/editor/EditorPage.tsx',
        './src/player/PlayerPage.tsx',
        './src/export/ExportDialog.tsx',
        './src/io/ImportDialog.tsx',
      ],
    },
  },
  optimizeDeps: {
    include: ['@zumer/snapdom', 'mediabunny', 'mermaid', 'elkjs/lib/elk-api', 'cmdk'],
  },
})
