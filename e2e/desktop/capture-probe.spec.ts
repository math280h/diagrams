import { readFileSync, writeFileSync } from 'node:fs'
import type { DesktopApi } from '@/desktop/contract'
import { compileFlow } from '@/engine/flow/compile'
import { DIAGRAM_VERSION, type Diagram } from '@/model/schema'
import { fromDiagram } from '@/persistence/serialize'
import { expect, test } from './fixtures'

const MOMENTS = 12

function flowStage() {
  const sample = JSON.parse(readFileSync(`src/persistence/formats/v${DIAGRAM_VERSION}.json`, 'utf8')) as {
    diagrams: Diagram[]
  }
  const diagram = sample.diagrams.find((candidate) => candidate.nodes.length > 0 && candidate.flows.length > 0)!
  const { nodes, edges } = fromDiagram(diagram)
  const flow = diagram.flows[0]!
  const { durationMs } = compileFlow(flow, new Set(nodes.map((node) => node.id)), edges, null)
  const spec = {
    width: 1280,
    height: 720,
    nodes,
    edges,
    theme: diagram.theme,
    resolvedTheme: 'dark' as const,
    transparent: false,
    viewport: { x: 0, y: 0, zoom: 1 },
    flows: diagram.flows,
    fitPadding: 0.12,
    flow: { flow, pathId: null },
  }
  return { spec, durationMs }
}

test('probe: stills before and after the frames, and the frames', async ({ window: page }, testInfo) => {
  const stage = flowStage()
  const result = await page.evaluate(
    async ({ spec, durationMs, count }) => {
      const { desktop } = window as unknown as { desktop: DesktopApi }
      const { sessionId } = await desktop.request('capture.open', {
        stage: spec,
        width: spec.width,
        height: spec.height,
        fixedViewport: false,
      })
      const request = (timeMs: number) => ({ sessionId, moment: { ambientMs: timeMs, timeMs }, scale: 0.5, transparent: false })
      const toPixels = async (png: Uint8Array) => {
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(png)], { type: 'image/png' }))
        const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!
        context.drawImage(bitmap, 0, 0)
        return { width: bitmap.width, height: bitmap.height, data: context.getImageData(0, 0, bitmap.width, bitmap.height).data }
      }
      const toPng = async (image: { width: number; height: number; data: ArrayLike<number> }) => {
        const canvas = new OffscreenCanvas(image.width, image.height)
        canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0)
        const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
        let text = ''
        for (const byte of bytes) text += String.fromCharCode(byte)
        return btoa(text)
      }
      const differing = (a: ArrayLike<number>, b: ArrayLike<number>) => {
        let changed = 0
        for (let i = 0; i < a.length; i += 4) {
          const delta = Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!)
          if (delta > 6) changed++
        }
        return changed
      }
      const moments = Array.from({ length: count }, (_, index) => Math.round((((index * 5) % count) / count) * durationMs))
      const timed = async <T>(task: () => Promise<T>) => {
        const started = performance.now()
        const value = await task()
        return { value, ms: Math.round(performance.now() - started) }
      }
      type Shot = { value: { width: number; height: number; data: ArrayLike<number> }; ms: number }
      const first: Shot[] = []
      for (const timeMs of moments) first.push(await timed(async () => toPixels((await desktop.request('capture.image', request(timeMs))).png)))
      const frames: Shot[] = []
      for (const timeMs of moments) {
        frames.push(
          await timed(async () => {
            const frame = await desktop.request('capture.frame', request(timeMs))
            return { width: frame.width, height: frame.height, data: frame.pixels }
          }),
        )
      }
      const second: Shot[] = []
      for (const timeMs of moments) second.push(await timed(async () => toPixels((await desktop.request('capture.image', request(timeMs))).png)))
      await desktop.request('capture.close', { sessionId })
      const rows = moments.map((timeMs, k) => ({
        k,
        timeMs,
        firstMs: first[k]!.ms,
        frameMs: frames[k]!.ms,
        secondMs: second[k]!.ms,
        firstVsSecond: differing(first[k]!.value.data, second[k]!.value.data),
        frameVsFirst: differing(frames[k]!.value.data, first[k]!.value.data),
        frameVsSecond: differing(frames[k]!.value.data, second[k]!.value.data),
        closestFirst: (() => {
          const d = first.map((still) => differing(frames[k]!.value.data, still.value.data))
          return d.indexOf(Math.min(...d))
        })(),
      }))
      const bad = rows.filter((row) => row.firstVsSecond > 0 || row.frameVsSecond > 0 || row.closestFirst !== row.k)
      const images: { name: string; png: string }[] = []
      for (const row of bad.slice(0, 3)) {
        images.push({ name: `k${row.k}-first.png`, png: await toPng(first[row.k]!.value) })
        images.push({ name: `k${row.k}-frame.png`, png: await toPng(frames[row.k]!.value) })
        images.push({ name: `k${row.k}-second.png`, png: await toPng(second[row.k]!.value) })
      }
      return { rows, images }
    },
    { ...stage, count: MOMENTS },
  )
  writeFileSync(testInfo.outputPath('rows.json'), JSON.stringify(result.rows, null, 1))
  for (const image of result.images) writeFileSync(testInfo.outputPath(image.name), Buffer.from(image.png, 'base64'))
  console.log(`PROBE ${JSON.stringify(result.rows.map((row) => [row.k, row.firstVsSecond, row.frameVsSecond, row.closestFirst, row.firstMs, row.frameMs]))}`)
  expect(result.rows.filter((row) => row.closestFirst !== row.k || row.firstVsSecond > 0)).toEqual([])
})
