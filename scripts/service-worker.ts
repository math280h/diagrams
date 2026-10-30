import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { build, type Plugin, type Rolldown } from 'vite'
import { type AssetList, HASHED_FOLDER, SERVICE_WORKER_PATH } from '../src/sw/asset-list.ts'

const ENTRY = fileURLToPath(new URL('../src/sw/service-worker.ts', import.meta.url))
const PAGE_FILE = 'index.html'
const DESKTOP_ONLY_SOURCE = /[\\/]src[\\/]desktop[\\/]/

function chunkFiles(chunk: Rolldown.OutputChunk): string[] {
  return [...chunk.imports, ...(chunk.viteMetadata?.importedCss ?? []), ...(chunk.viteMetadata?.importedAssets ?? [])]
}

function withStaticImports(bundle: Rolldown.OutputBundle, start: Iterable<string>): Set<string> {
  const found = new Set<string>()
  const queue = [...start]
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (found.has(file)) continue
    found.add(file)
    const output = bundle[file]
    if (output?.type === 'chunk') queue.push(...chunkFiles(output))
  }
  return found
}

function fontsOf(bundle: Rolldown.OutputBundle, styleSheets: Iterable<string>): string[] {
  return [...styleSheets].flatMap((file) => {
    const output = bundle[file]
    if (output?.type !== 'asset' || !file.endsWith('.css')) return []
    const css = typeof output.source === 'string' ? output.source : new TextDecoder().decode(output.source)
    return [...css.matchAll(/url\(\/?(assets\/[^)"']+\.woff2)\)/g)].map((match) => match[1]!)
  })
}

/**
 * Returns the files of a website build that the service worker keeps.
 *
 * It precaches the entry with its static imports, the chunks that the entry loads on demand (such as the editor and
 * Present) with their static imports, and the WOFF2 fonts of their style sheets. Chunks that those chunks load on
 * demand, such as icon sets and the layout engine, wait until a page uses them.
 *
 * @param publicFiles - The paths of the files in the public folder, relative to it, with `/` between folders.
 */
export function planAssetList(bundle: Rolldown.OutputBundle, publicFiles: readonly string[]): AssetList {
  const outputs = Object.values(bundle)
  const entries = outputs.flatMap((output) => (output.type === 'chunk' && output.isEntry ? [output.fileName] : []))
  const core = withStaticImports(bundle, entries)
  const onDemand = [...core].flatMap((file) => {
    const output = bundle[file]
    return output?.type === 'chunk' ? output.dynamicImports : []
  })
  const loaded = onDemand.filter((file) => {
    const output = bundle[file]
    return !(output?.type === 'chunk' && output.facadeModuleId && DESKTOP_ONLY_SOURCE.test(output.facadeModuleId))
  })
  const app = withStaticImports(bundle, [...core, ...loaded])
  const toPath = (file: string) => `/${file}`
  return {
    shell: publicFiles.map(toPath),
    precache: [...new Set([...app, ...fontsOf(bundle, app)])].map(toPath).filter((p) => p.startsWith(HASHED_FOLDER)),
    all: outputs
      .map((output) => output.fileName)
      .filter((file) => file !== PAGE_FILE && !file.endsWith('.map'))
      .map(toPath),
  }
}

function publicFilesIn(folder: string): string[] {
  try {
    return readdirSync(folder, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(folder, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
  } catch {
    return []
  }
}

async function buildServiceWorker(assetListPath: string): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'warn',
    mode: 'production',
    publicDir: false,
    define: { ASSET_LIST_PATH: JSON.stringify(assetListPath) },
    build: {
      write: false,
      emptyOutDir: false,
      copyPublicDir: false,
      modulePreload: false,
      rolldownOptions: {
        input: ENTRY,
        output: { format: 'iife', codeSplitting: false, entryFileNames: 'sw.js' },
      },
    },
  })
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => ('output' in item ? item.output : []))
  const worker = outputs.find((output) => output.type === 'chunk' && output.fileName === 'sw.js')
  if (worker?.type !== 'chunk') throw new Error('The service worker build has no sw.js.')
  return worker.code
}

/**
 * Creates a Vite plugin that adds the service worker to a website build: `sw.js` at the site root, and an asset list
 * with a content hash that names the build (see {@link planAssetList}).
 */
export function serviceWorker(): Plugin {
  let publicDir: string | false = false
  return {
    name: 'service-worker',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir || false
    },
    generateBundle: {
      order: 'post',
      async handler(_options, bundle) {
        const list = planAssetList(bundle, publicDir ? publicFilesIn(publicDir) : [])
        const reference = this.emitFile({ type: 'asset', name: 'sw-assets.json', source: JSON.stringify(list) })
        const assetListPath = `/${this.getFileName(reference)}`
        this.emitFile({
          type: 'asset',
          fileName: SERVICE_WORKER_PATH.slice(1),
          source: await buildServiceWorker(assetListPath),
        })
      },
    },
  }
}
