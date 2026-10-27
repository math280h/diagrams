import { fileURLToPath, URL } from 'node:url'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { build, type Plugin, type Rolldown } from 'vite'
import { PLAYER_FILES, type PlayerFiles } from '../src/standalone/files.ts'
import { thirdPartyLicenses } from './third-party-licenses.ts'

const ENTRY = fileURLToPath(new URL('../src/standalone/main.tsx', import.meta.url))
const SOURCE = fileURLToPath(new URL('../src', import.meta.url))
const DYNAMIC_ICONS_STUB = fileURLToPath(new URL('../src/standalone/no-dynamic-icons.ts', import.meta.url))
const EMPTY_URL = '\0standalone-empty-url'

/** Leaves the icon set files out of the player. The exported page carries the icons that its diagram uses. */
function withoutIconSetFiles(): Plugin {
  return {
    name: 'standalone-player:no-icon-sets',
    enforce: 'pre',
    resolveId(source) {
      return /\/data\/\w+\.json\?url$/.test(source) ? EMPTY_URL : null
    },
    load(id) {
      return id === EMPTY_URL ? 'export default ""' : null
    },
  }
}

function fileText(output: Rolldown.OutputChunk | Rolldown.OutputAsset): string {
  if (output.type === 'chunk') return output.code
  return typeof output.source === 'string' ? output.source : new TextDecoder().decode(output.source)
}

// Vite and the React plugin choose production code from NODE_ENV when they resolve a config. A dev server sets it to
// `development`.
async function asProduction<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    return await run()
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  }
}

async function buildPlayer(): Promise<PlayerFiles> {
  const licenses = thirdPartyLicenses('licenses.txt')
  const result = await asProduction(() =>
    build({
      configFile: false,
      logLevel: 'warn',
      mode: 'production',
      plugins: [
        withoutIconSetFiles(),
        react(),
        babel({ presets: [reactCompilerPreset()] }),
        tailwindcss(),
        licenses.main,
      ],
      resolve: {
        alias: [
          { find: /^lucide-react\/dynamic$/, replacement: DYNAMIC_ICONS_STUB },
          { find: /^@\//, replacement: `${SOURCE}/` },
        ],
      },
      build: {
        write: false,
        emptyOutDir: false,
        copyPublicDir: false,
        cssCodeSplit: false,
        modulePreload: false,
        assetsInlineLimit: () => true,
        rolldownOptions: {
          input: ENTRY,
          output: {
            format: 'iife',
            codeSplitting: false,
            entryFileNames: 'player.js',
            assetFileNames: 'player[extname]',
          },
        },
      },
    }),
  )
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => ('output' in item ? item.output : []))
  const find = (name: string) => {
    const output = outputs.find((candidate) => candidate.fileName === name)
    if (!output) throw new Error(`The player build has no ${name}.`)
    return fileText(output)
  }
  return { script: find('player.js'), style: find('player.css'), licenses: find('licenses.txt') }
}

/**
 * Creates a Vite plugin that builds the standalone player of the HTML export: one script, one style sheet and the
 * licence texts of the packages in them.
 *
 * The web build writes the files to the paths in `PLAYER_FILES`. The dev server builds them on the first request, and again
 * after a source file changes.
 */
export function standalonePlayer(): Plugin {
  let cached: Promise<PlayerFiles> | null = null
  const files = () => (cached ??= buildPlayer())
  return {
    name: 'standalone-player',
    configureServer(server) {
      server.watcher.on('change', () => {
        cached = null
      })
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0]?.replace(/^\//, '')
        const key = (Object.keys(PLAYER_FILES) as (keyof PlayerFiles)[]).find(
          (candidate) => PLAYER_FILES[candidate] === path,
        )
        if (!key) return next()
        const type = key === 'script' ? 'text/javascript' : key === 'style' ? 'text/css' : 'text/plain'
        files().then(
          (built) => {
            response.setHeader('Content-Type', `${type}; charset=utf-8`)
            response.end(built[key])
          },
          (error: unknown) => {
            cached = null
            next(error)
          },
        )
      })
    },
    async generateBundle() {
      const built = await buildPlayer()
      for (const key of Object.keys(PLAYER_FILES) as (keyof PlayerFiles)[]) {
        this.emitFile({ type: 'asset', fileName: PLAYER_FILES[key], source: built[key] })
      }
    },
  }
}
