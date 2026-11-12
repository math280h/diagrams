import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { buildDefine, readBuildConfig, releaseLinks } from './src/desktop/build-config.ts'
import { contentSecurityPolicy } from './scripts/content-security-policy.ts'
import { reactCompilerCheck, reactCompilerLogger } from './scripts/react-compiler.ts'
import { releaseNotes } from './scripts/release-notes.ts'
import { serviceWorker } from './scripts/service-worker.ts'
import { standalonePlayer } from './scripts/standalone-player.ts'
import { thirdPartyLicenses } from './scripts/third-party-licenses.ts'
import { websiteAddress } from './scripts/website-address.ts'

// Vite reloads each open page when an HTML file in the project folder or in a subfolder changes.
const GENERATED_FOLDERS = [
  'dist',
  'dist-ssr',
  'dist-electron',
  'out',
  'release',
  'coverage',
  'coverage-e2e',
  'coverage-all',
  'playwright-report',
  '.app-screens',
  '.format-samples',
  '.playwright-mcp',
  '.vitest',
  '.claude/worktrees',
]
const PROJECT_FOLDER = fileURLToPath(new URL('.', import.meta.url))

function inGeneratedFolder(file: string): boolean {
  return GENERATED_FOLDERS.some((folder) => {
    const relative = path.relative(path.join(PROJECT_FOLDER, folder), file)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
  })
}

const licenses = thirdPartyLicenses()
const build = readBuildConfig(process.env)

export default defineConfig({
  define: buildDefine(build),
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset({ logger: reactCompilerLogger })] }),
    reactCompilerCheck(),
    tailwindcss(),
    licenses.main,
    standalonePlayer(),
    releaseNotes(releaseLinks(build.repository)),
    websiteAddress(build.website),
    serviceWorker(),
    contentSecurityPolicy(build.reports.url),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  worker: { format: 'es', plugins: () => [licenses.worker()] },
  server: {
    host: '127.0.0.1',
    watch: { ignored: [inGeneratedFolder] },
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
    include: ['@zumer/snapdom', 'mediabunny', 'mermaid', 'elkjs/lib/elk-api', 'cmdk', '@hpcc-js/wasm-graphviz'],
  },
})
