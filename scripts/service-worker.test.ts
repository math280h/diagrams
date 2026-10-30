import type { Rolldown } from 'vite'
import { describe, expect, it } from 'vitest'
import { planAssetList } from './service-worker.ts'

interface ChunkOptions {
  isEntry?: boolean
  imports?: string[]
  dynamicImports?: string[]
  facadeModuleId?: string
  css?: string[]
}

function chunk(fileName: string, options: ChunkOptions = {}) {
  return {
    type: 'chunk',
    fileName,
    isEntry: options.isEntry ?? false,
    imports: options.imports ?? [],
    dynamicImports: options.dynamicImports ?? [],
    facadeModuleId: options.facadeModuleId ?? null,
    viteMetadata: { importedCss: new Set(options.css ?? []), importedAssets: new Set<string>() },
  }
}

function asset(fileName: string, source = '') {
  return { type: 'asset', fileName, source }
}

const BUNDLE = Object.fromEntries(
  [
    asset('index.html'),
    chunk('assets/index-a.js', {
      isEntry: true,
      imports: ['assets/react-b.js'],
      dynamicImports: ['assets/EditorPage-c.js', 'assets/runtime-d.js'],
      css: ['assets/index-e.css'],
    }),
    chunk('assets/react-b.js'),
    chunk('assets/EditorPage-c.js', {
      imports: ['assets/canvas-f.js'],
      dynamicImports: ['assets/aws-g.js'],
      facadeModuleId: '/repo/src/editor/EditorPage.tsx',
    }),
    chunk('assets/runtime-d.js', { facadeModuleId: 'C:\\repo\\src\\desktop\\runtime.ts' }),
    asset('assets/index-e.css', '@font-face{src:url(/assets/inter-h.woff2) format("woff2"),url(/assets/inter-i.woff)}'),
    chunk('assets/canvas-f.js'),
    chunk('assets/aws-g.js'),
    asset('assets/inter-h.woff2'),
    asset('assets/inter-i.woff'),
    asset('assets/index-a.js.map'),
    asset('standalone/player.js'),
  ].map((output) => [output.fileName, output]),
) as unknown as Rolldown.OutputBundle

describe('planAssetList', () => {
  const list = planAssetList(BUNDLE, ['favicon.svg', 'icons/icon-192.png'])

  it('precaches the entry, the pages it loads and their fonts', () => {
    expect(list.precache.toSorted()).toEqual(
      [
        '/assets/EditorPage-c.js',
        '/assets/canvas-f.js',
        '/assets/index-a.js',
        '/assets/index-e.css',
        '/assets/inter-h.woff2',
        '/assets/react-b.js',
      ].toSorted(),
    )
  })

  it('leaves out chunks that pages load on demand, code of the desktop app and old font formats', () => {
    expect(list.precache).not.toContain('/assets/aws-g.js')
    expect(list.precache).not.toContain('/assets/runtime-d.js')
    expect(list.precache).not.toContain('/assets/inter-i.woff')
  })

  it('lists every file of the build except the page and source maps', () => {
    expect(list.all).toContain('/assets/aws-g.js')
    expect(list.all).toContain('/standalone/player.js')
    expect(list.all).not.toContain('/index.html')
    expect(list.all).not.toContain('/assets/index-a.js.map')
    expect(list.all).toHaveLength(10)
  })

  it('puts the public files in the shell', () => {
    expect(list.shell).toEqual(['/favicon.svg', '/icons/icon-192.png'])
  })
})
