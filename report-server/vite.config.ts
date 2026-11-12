import { builtinModules } from 'node:module'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { thirdPartyLicenses } from '../scripts/third-party-licenses.ts'

const NODE_BUILTINS = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)]
// capjs-core loads these packages only for its browser checks.
const UNUSED_PACKAGES = ['esbuild', 'javascript-obfuscator']
const NO_HASHWX = fileURLToPath(new URL('./src/no-hashwx.ts', import.meta.url))

function withoutHashwx(): Plugin {
  return {
    name: 'without-hashwx',
    enforce: 'pre',
    resolveId(source, importer) {
      const fromCap = importer?.replaceAll('\\', '/').includes('/node_modules/capjs-core/') ?? false
      return fromCap && source === './hashwx.js' ? NO_HASHWX : null
    },
  }
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir: false,
  publicDir: false,
  plugins: [withoutHashwx(), thirdPartyLicenses('third-party-licenses.txt').main],
  resolve: {
    alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) },
  },
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: 'src/server.ts',
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node24',
    minify: false,
    rolldownOptions: {
      external: [...NODE_BUILTINS, ...UNUSED_PACKAGES],
      output: {
        format: 'es',
        entryFileNames: 'server.js',
        codeSplitting: false,
        banner:
          "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
      },
    },
  },
})
