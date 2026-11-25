import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { ElectronApplication } from '@playwright/test'
import { decodeFrames } from 'modern-gif'
import { CAPTURE_HASH } from '@/desktop/constants'
import { compileFlow } from '@/engine/flow/compile'
import { diagramBounds } from '@/export/bounds'
import { allOpaque } from '@/export/capture-plan'
import { DIAGRAM_VERSION, type Diagram } from '@/model/schema'
import { fromDiagram } from '@/persistence/serialize'
import { builtInTheme } from '@/themes/built-in'
import { copyTemplate } from '../helpers'
import { callTool, expect, test } from './fixtures'
import {
  captureFrame,
  captureImage,
  closeStage,
  colourCount,
  decodePng,
  encodePng,
  openStage,
  type Pixels,
} from './pixels'

const PADDING_PX = 48
const MOMENTS = 12
/** The largest number of neighbour pixel pairs with opposite red and blue shifts in a capture. */
const MAX_COLOUR_PAIRS = 50
const BLANK_FRAME_MAX_COLOURS = 10

function captureWindowId(app: ElectronApplication) {
  return app.evaluate(
    ({ BrowserWindow }, hash) =>
      BrowserWindow.getAllWindows().find((other) => other.webContents.getURL().endsWith(hash))?.webContents.id,
    CAPTURE_HASH,
  )
}

/** Saves the next download of the app to a file, without the save dialog. */
function saveNextDownload(app: ElectronApplication, file: string) {
  return app.evaluate(({ session }, savePath) => {
    const state = globalThis as { downloadState?: string }
    state.downloadState = 'waiting'
    session.defaultSession.once('will-download', (_event, item) => {
      item.setSavePath(savePath)
      item.once('done', (_done, result) => {
        state.downloadState = result
      })
    })
  }, file)
}

/** Returns `completed`, `cancelled` or `interrupted` after the download ends, and `waiting` before. */
function downloadState(app: ElectronApplication) {
  return app.evaluate(() => (globalThis as { downloadState?: string }).downloadState)
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
    colorTheme: builtInTheme('dark')!,
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
    colorTheme: builtInTheme('light')!,
    viewport: { x: PADDING_PX - bounds.x, y: PADDING_PX - bounds.y, zoom: 1 },
    transparent: false,
    flows: [],
  }
}

test('renders the image of an agent in the capture window and keeps the zoom of the main window', async ({
  app,
  window,
  mcp,
  evidence,
}) => {
  await callTool(mcp, 'create_diagram', { name: 'Captured', template: 'order-system' })
  await expect(window.locator('[data-editor-canvas] .react-flow__node').first()).toBeVisible()
  const pixelRatio = await window.evaluate(() => globalThis.devicePixelRatio)

  const result = await callTool(mcp, 'render_image', { maxSizePx: 800 })
  const data = result.content.find((block) => block.type === 'image')?.data
  if (data) evidence.keep('agent-image.png', Buffer.from(data, 'base64'))
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

  const image = await decodePng(app, Buffer.from(data!, 'base64'))
  expect(image.width).toBe(800)
  expect(image.data[3]).toBe(255)
  expect(colourCount(image, 7)).toBeGreaterThan(20)
})

test('opens a new capture window after the old one stops', async ({ app, window, mcp }) => {
  await callTool(mcp, 'create_diagram', { name: 'Captured', template: 'order-system' })
  await expect(window.locator('[data-editor-canvas] .react-flow__node').first()).toBeVisible()
  await callTool(mcp, 'render_image', { maxSizePx: 400 })
  const first = await captureWindowId(app)
  expect(first).toBeDefined()
  await app.evaluate(({ webContents }, id) => process.kill(webContents.fromId(id!)!.getOSProcessId()), first)
  await expect.poll(() => captureWindowId(app), { timeout: 15_000 }).toBeUndefined()

  const result = await callTool(mcp, 'render_image', { maxSizePx: 400 })
  expect(result.json.width).toBe(400)
  const second = await captureWindowId(app)
  expect(second).toBeDefined()
  expect(second).not.toBe(first)
})

test('renders the next video frame in a new capture window after the GPU process stops', async ({
  app,
  window: page,
}) => {
  const { spec } = flowStage()
  const sessionId = await openStage(page, spec, false)
  const request = { sessionId, moment: { ambientMs: 0, timeMs: 0 }, scale: 0.5, transparent: false }
  await captureFrame(page, request)
  const first = await captureWindowId(app)
  await app.evaluate(({ app: electronApp }) => {
    electronApp.emit('child-process-gone', {}, { type: 'GPU', reason: 'killed', exitCode: 9 })
  })

  const frame = await captureFrame(page, request)
  await closeStage(page, sessionId)
  expect(await captureWindowId(app)).not.toBe(first)
  expect(allOpaque(frame.data)).toBe(true)
  expect(colourCount(frame)).toBeGreaterThan(20)
})

test('gives the pixels of the image in a video frame, within 2 in each channel, also for a small image', async ({
  app,
  window: page,
  evidence,
}) => {
  const stage = sampleStage()
  const sessionId = await openStage(page, stage, true)
  for (const scale of [0.5, 0.2, 0.02]) {
    const request = { sessionId, moment: { ambientMs: 0, timeMs: 0 }, scale, transparent: false }
    const png = await captureImage(page, request)
    evidence.keep(`scale-${scale}-image.png`, png)
    const image = await decodePng(app, png)
    const frame = await captureFrame(page, request)
    evidence.keep(`scale-${scale}-frame.png`, await encodePng(app, frame))
    const expected = [Math.round(stage.width * scale), Math.round(stage.height * scale)]
    expect([image.width, image.height]).toEqual(expected)
    expect([frame.width, frame.height]).toEqual(expected)
    let maxDelta = 0
    for (let i = 0; i < image.data.length; i++) maxDelta = Math.max(maxDelta, Math.abs(image.data[i]! - frame.data[i]!))
    expect(maxDelta, `largest channel difference at scale ${scale}`).toBeLessThanOrEqual(2)
    expect(colourCount(image)).toBeGreaterThan(image.width < 100 ? 5 : 20)
  }
  await closeStage(page, sessionId)
})

test('draws text without subpixel colour fringes', async ({ app, window: page }) => {
  const stage = sampleStage()
  const sessionId = await openStage(page, stage, true)
  const png = await captureImage(page, { sessionId, moment: { ambientMs: 0, timeMs: 0 }, scale: 2, transparent: false })
  await closeStage(page, sessionId)
  const { data } = await decodePng(app, png)
  let pairs = 0
  for (let i = 0; i + 4 < data.length; i += 4) {
    const left = data[i]! - data[i + 2]!
    const right = data[i + 4]! - data[i + 6]!
    if ((left > 40 && right < -40) || (left < -40 && right > 40)) pairs++
  }
  expect(pairs).toBeLessThanOrEqual(MAX_COLOUR_PAIRS)
})

test('gives each video frame the pixels of its own moment', async ({ app, window: page, evidence }) => {
  const { spec, durationMs } = flowStage()
  const sessionId = await openStage(page, spec, false)
  const request = (timeMs: number) => ({
    sessionId,
    moment: { ambientMs: timeMs, timeMs },
    scale: 0.5,
    transparent: false,
  })
  const differing = (a: Pixels, b: Pixels) => {
    let changed = 0
    for (let i = 0; i < a.data.length; i += 4) {
      const delta =
        Math.abs(a.data[i]! - b.data[i]!) +
        Math.abs(a.data[i + 1]! - b.data[i + 1]!) +
        Math.abs(a.data[i + 2]! - b.data[i + 2]!)
      if (delta > 6) changed++
    }
    return changed
  }
  const moments = Array.from({ length: MOMENTS }, (_, index) =>
    Math.round((((index * 5) % MOMENTS) / MOMENTS) * durationMs),
  )
  const stills: Pixels[] = []
  for (const [index, timeMs] of moments.entries()) {
    const png = await captureImage(page, request(timeMs))
    evidence.keep(`moment-${index}-still.png`, png)
    stills.push(await decodePng(app, png))
  }
  const closest: number[] = []
  for (const [index, timeMs] of moments.entries()) {
    const frame = await captureFrame(page, request(timeMs))
    const distances = stills.map((still) => differing(frame, still))
    const nearest = distances.indexOf(Math.min(...distances))
    closest.push(nearest)
    if (nearest !== index) evidence.keep(`moment-${index}-frame-closest-to-${nearest}.png`, await encodePng(app, frame))
  }
  await closeStage(page, sessionId)
  const changes = stills.slice(1).map((still, index) => differing(still, stills[index]!))
  expect(Math.min(...changes)).toBeGreaterThan(0)
  expect(closest).toEqual(closest.map((_, index) => index))
})

test('exports a transparent PNG and a GIF from the export dialog in the capture window', async ({
  app,
  window,
  dirs,
  evidence,
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
  await expect.poll(() => downloadState(app), { timeout: 60_000 }).toBe('completed')
  const urls = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => w.webContents.getURL()),
  )
  expect(urls.some((url) => url.endsWith(CAPTURE_HASH))).toBe(true)
  evidence.keep('order-system.png', readFileSync(png))

  const image = await decodePng(app, readFileSync(png))
  let opaque = 0
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i] === 255) opaque++
  const opaqueShare = opaque / (image.width * image.height)
  expect(image.data[3]).toBe(0)
  expect(opaqueShare).toBeGreaterThan(0.05)
  expect(opaqueShare).toBeLessThan(0.95)

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
  await expect.poll(() => downloadState(app), { timeout: 120_000 }).toBe('completed')
  const gifBytes = readFileSync(gif)
  evidence.keep('order-system.gif', gifBytes)
  // modern-gif ignores the byte offset of a typed array, and readFileSync can give a small file inside a shared buffer.
  const frames = decodeFrames(new Uint8Array(gifBytes))
  expect(frames.length).toBeGreaterThan(5)
  const colours = frames.map((frame) => colourCount({ width: frame.width, height: frame.height, data: frame.data }))
  expect(Math.min(...colours), 'the fewest colours in a frame').toBeGreaterThan(BLANK_FRAME_MAX_COLOURS)
})
