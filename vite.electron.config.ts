import { builtinModules } from 'node:module'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type UserConfig } from 'vite'
import { checkGitHubApp } from './scripts/github-app.ts'
import { thirdPartyLicenses, withoutPackages } from './scripts/third-party-licenses.ts'
import { buildDefine, readBuildConfig } from './src/desktop/build-config.ts'

const NODE_BUILTINS = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)]

const ENTRIES = {
  main: { input: './electron/main.ts', format: 'es', fileName: 'main.js' },
  preload: { input: './electron/preload.ts', format: 'cjs', fileName: 'preload.cjs' },
} as const

export default defineConfig(async ({ mode }): Promise<UserConfig> => {
  const entry = mode === 'preload' ? ENTRIES.preload : ENTRIES.main
  const build = readBuildConfig(process.env)
  if (entry === ENTRIES.main && build.githubApp) await checkGitHubApp(build.githubApp)
  return {
    define: buildDefine(build),
    publicDir: false,
    plugins: mode === 'preload' ? [withoutPackages()] : [thirdPartyLicenses('third-party-licenses.main.txt').main],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    ssr: { noExternal: true, target: 'node' },
    build: {
      ssr: entry.input,
      outDir: 'dist-electron',
      emptyOutDir: false,
      target: 'node24',
      sourcemap: true,
      minify: false,
      rolldownOptions: {
        external: ['electron', ...NODE_BUILTINS],
        output: {
          format: entry.format,
          entryFileNames: entry.fileName,
          codeSplitting: false,
          banner:
            entry.format === 'es'
              ? "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);"
              : undefined,
        },
      },
    },
  }
})
