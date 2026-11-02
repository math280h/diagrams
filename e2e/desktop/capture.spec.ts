import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { ElectronApplication } from '@playwright/test'
import { decode } from 'modern-gif'
import { CAPTURE_HASH } from '@/desktop/constants'
import type { DesktopApi } from '@/desktop/contract'
import { compileFlow } from '@/engine/flow/compile'
import { diagramBounds } from '@/export/bounds'
import { DIAGRAM_VERSION, type Diagram } from '@/model/schema'
import { fromDiagram } from '@/persistence/serialize'
import { copyTemplate } from '../helpers'
import { callTool, expect, test } from './fixtures'

const PADDING_PX = 48
const MOMENTS = 12

/** Saves the next download of the app to a file, without the save dialog. */
function saveNextDownload(app: ElectronApplication, file: string) {
  return app.evaluate(({ session }, savePath) => {
    session.defaultSession.once('will-download', (_event, item) => item.setSavePath(savePath))
  }, file)
}

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

function sampleStage() {
  const sample = JSON.parse(readFileSync(`src/persistence/formats/v${DIAGRAM_VERSION}.json`, 'utf8')) as {
    diagrams: Diagram[]
  }
  const diagram = sample.diagrams.find((candidate) => candidate.nodes.length > 0)!
  const { nodes, edges } = fromDiagram(diagram)
  const bounds = diagramBounds(nodes)
  const width = Math.ceil(bounds.width + PADDING_PX * 2)
  const height = Math.ceil(bounds.height + PADDING_PX * 2)
  return {
    width,
    height,
    nodes,
    edges,
    theme: { ...diagram.theme, background: 'none' as const },
    resolvedTheme: 'light' as const,
    viewport: { x: PADDING_PX - bounds.x, y: PADDING_PX - bounds.y, zoom: 1 },
    transparent: false,
    flows: [],
  }
}

test('renders the image of an agent in the capture window and keeps the zoom of the main window', async ({
  app,
  window,
  mcp,
}) => {
  await callTool(mcp, 'create_diagram', { name: 'Captured', template: 'order-system' })
  await expect(window.locator('[data-editor-canvas] .react-flow__node').first()).toBeVisible()
  const pixelRatio = await window.evaluate(() => globalThis.devicePixelRatio)

  const result = await callTool(mcp, 'render_image', { maxSizePx: 800 })
  const data = result.content.find((block) => block.type === 'image')?.data
  expect(result.json.width).toBe(800)

  const windows = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((other) => ({
      url: other.webContents.getURL(),
      zoom: other.webContents.getZoomFactor(),
    })),
  )
  expect(windows.filter((other) => other.url.endsWith(CAPTURE_HASH))).toHaveLength(1)
  expect(windows.filter((other) => !other.url.endsWith(CAPTURE_HASH)).map((other) => other.zoom)).toEqual([1])
  expect(await window.evaluate(() => globalThis.devicePixelRatio)).toBe(pixelRatio)

  const image = await window.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    const colors = new Set<number>()
    for (let i = 0; i < pixels.length; i += 4 * 7)
      colors.add((pixels[i]! << 16) | (pixels[i + 1]! << 8) | pixels[i + 2]!)
    return { width: bitmap.width, corner: Array.from(pixels.subarray(0, 4)), colors: colors.size }
  }, data!)
  expect(image.width).toBe(800)
  expect(image.corner[3]).toBe(255)
  expect(image.colors).toBeGreaterThan(20)
})

test('opens a new capture window after the old one stops', async ({ app, window, mcp }) => {
  const captureWindowId = () =>
    app.evaluate(
      ({ BrowserWindow }, hash) =>
        BrowserWindow.getAllWindows().find((other) => other.webContents.getURL().endsWith(hash))?.webContents.id,
      CAPTURE_HASH,
    )
  await callTool(mcp, 'create_diagram', { name: 'Captured', template: 'order-system' })
  await expect(window.locator('[data-editor-canvas] .react-flow__node').first()).toBeVisible()
  await callTool(mcp, 'render_image', { maxSizePx: 400 })
  const first = await captureWindowId()
  expect(first).toBeDefined()
  await app.evaluate(({ webContents }, id) => process.kill(webContents.fromId(id!)!.getOSProcessId()), first)
  await expect.poll(captureWindowId, { timeout: 15_000 }).toBeUndefined()

  const result = await callTool(mcp, 'render_image', { maxSizePx: 400 })
  expect(result.json.width).toBe(400)
  const second = await captureWindowId()
  expect(second).toBeDefined()
  expect(second).not.toBe(first)
})

test('gives the pixels of the image in a video frame, within 2 in each channel, also for a small image', async ({
  window: page,
}) => {
  const stage = sampleStage()
  const result = await page.evaluate(async (spec) => {
    const { desktop } = window as unknown as { desktop: DesktopApi }
    const { sessionId } = await desktop.request('capture.open', {
      stage: spec,
      width: spec.width,
      height: spec.height,
      fixedViewport: true,
    })
    const decodePng = async (png: Uint8Array) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(png)], { type: 'image/png' }))
      const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!
      context.drawImage(bitmap, 0, 0)
      return {
        width: bitmap.width,
        height: bitmap.height,
        pixels: context.getImageData(0, 0, bitmap.width, bitmap.height).data,
      }
    }
    const compare = async (scale: number) => {
      const request = { sessionId, moment: { ambientMs: 0, timeMs: 0 }, scale, transparent: false }
      const image = await decodePng((await desktop.request('capture.image', request)).png)
      const frame = await desktop.request('capture.frame', request)
      let maxDelta = 0
      const colors = new Set<number>()
      for (let i = 0; i < image.pixels.length; i += 4) {
        for (let channel = 0; channel < 4; channel++) {
          maxDelta = Math.max(maxDelta, Math.abs(image.pixels[i + channel]! - frame.pixels[i + channel]!))
        }
        colors.add((image.pixels[i]! << 16) | (image.pixels[i + 1]! << 8) | image.pixels[i + 2]!)
      }
      return {
        image: [image.width, image.height],
        frame: [frame.width, frame.height],
        expected: [Math.round(spec.width * scale), Math.round(spec.height * scale)],
        maxDelta,
        colors: colors.size,
      }
    }
    const results = [await compare(0.5), await compare(0.2), await compare(0.02)]
    await desktop.request('capture.close', { sessionId })
    return results
  }, stage)
  for (const capture of result) {
    expect(capture.image).toEqual(capture.expected)
    expect(capture.frame).toEqual(capture.expected)
    expect(capture.maxDelta).toBeLessThanOrEqual(2)
    expect(capture.colors).toBeGreaterThan(capture.image[0]! < 100 ? 5 : 20)
  }
})

test('gives each video frame the pixels of its own moment', async ({ window: page }) => {
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
      const request = (timeMs: number) => ({
        sessionId,
        moment: { ambientMs: timeMs, timeMs },
        scale: 0.5,
        transparent: false,
      })
      const decodePng = async (png: Uint8Array) => {
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(png)], { type: 'image/png' }))
        const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!
        context.drawImage(bitmap, 0, 0)
        return context.getImageData(0, 0, bitmap.width, bitmap.height).data
      }
      const differing = (a: ArrayLike<number>, b: ArrayLike<number>) => {
        let changed = 0
        for (let i = 0; i < a.length; i += 4) {
          const delta = Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!)
          if (delta > 6) changed++
        }
        return changed
      }
      const moments = Array.from({ length: count }, (_, index) =>
        Math.round((((index * 5) % count) / count) * durationMs),
      )
      const stills: Uint8ClampedArray[] = []
      for (const timeMs of moments)
        stills.push(await decodePng((await desktop.request('capture.image', request(timeMs))).png))
      const changes = stills.slice(1).map((still, index) => differing(still, stills[index]!))
      const closest: number[] = []
      for (const index of moments.keys()) {
        const frame = await desktop.request('capture.frame', request(moments[index]!))
        const distances = stills.map((still) => differing(frame.pixels, still))
        closest.push(distances.indexOf(Math.min(...distances)))
      }
      await desktop.request('capture.close', { sessionId })
      return { changes, closest }
    },
    { ...stage, count: MOMENTS },
  )
  expect(Math.min(...result.changes)).toBeGreaterThan(0)
  expect(result.closest).toEqual(result.closest.map((_, index) => index))
})

test('exports a transparent PNG and a GIF from the export dialog in the capture window', async ({
  app,
  window,
  dirs,
}) => {
  test.setTimeout(180_000)
  await copyTemplate(window, 'Order system')
  await window.getByRole('button', { name: 'Export' }).click()
  await window.getByRole('menuitem', { name: /Image/ }).click()
  await window.getByRole('button', { name: 'Transparent' }).click()
  await expect(window.getByRole('img', { name: 'Export preview' })).toBeVisible({ timeout: 30_000 })
  const png = path.join(path.dirname(dirs.data), 'order-system.png')
  await saveNextDownload(app, png)
  await window.getByRole('button', { name: 'Export PNG' }).click()
  await expect.poll(() => existsSync(png), { timeout: 60_000 }).toBe(true)
  const urls = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => w.webContents.getURL()),
  )
  expect(urls.some((url) => url.endsWith(CAPTURE_HASH))).toBe(true)

  const image = await window.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    let opaque = 0
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] === 255) opaque++
    return { corner: pixels[3], opaqueShare: opaque / (pixels.length / 4) }
  }, readFileSync(png).toString('base64'))
  expect(image.corner).toBe(0)
  expect(image.opaqueShare).toBeGreaterThan(0.05)
  expect(image.opaqueShare).toBeLessThan(0.95)

  await window.getByRole('button', { name: 'Export' }).click()
  await window.getByRole('menuitem', { name: /Animation/ }).click()
  await window.getByRole('combobox', { name: 'Content' }).click()
  await window.getByRole('option', { name: 'Traffic only, no flow' }).click()
  await window.getByRole('button', { name: 'GIF', exact: true }).click()
  await window.getByRole('group', { name: 'Frame rate' }).getByRole('button', { name: '10 fps' }).click()
  await window.getByRole('slider').fill('2')
  const gif = path.join(path.dirname(dirs.data), 'order-system.gif')
  await saveNextDownload(app, gif)
  await window.getByRole('button', { name: 'Export GIF' }).click()
  await expect.poll(() => existsSync(gif), { timeout: 120_000 }).toBe(true)
  await expect.poll(() => readFileSync(gif).subarray(0, 6).toString(), { timeout: 30_000 }).toBe('GIF89a')
  const frames = decode(readFileSync(gif)).frames
  expect(frames.length).toBeGreaterThan(5)
})
