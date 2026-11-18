import type { ElectronApplication, Page } from '@playwright/test'
import type { CaptureRequest, DesktopApi } from '@/desktop/contract'
import { bgraToRgba } from '@/export/capture-plan'

/** RGBA pixels with straight alpha, as `ImageData` holds them. */
export interface Pixels {
  width: number
  height: number
  data: Uint8Array | Uint8ClampedArray
}

/**
 * Decodes a PNG in the main process of the app. The main process decodes on the CPU, so a restart of the GPU process
 * cannot change the result, as it can for a canvas in a page.
 */
export async function decodePng(app: ElectronApplication, png: Uint8Array): Promise<Pixels> {
  const decoded = await app.evaluate(({ nativeImage }, base64) => {
    const image = nativeImage.createFromBuffer(Buffer.from(base64, 'base64'))
    return { ...image.getSize(), bgra: image.toBitmap().toString('base64') }
  }, Buffer.from(png).toString('base64'))
  return { width: decoded.width, height: decoded.height, data: bgraToRgba(Buffer.from(decoded.bgra, 'base64')) }
}

/** Encodes pixels as a PNG in the main process of the app. */
export async function encodePng(app: ElectronApplication, pixels: Pixels): Promise<Buffer> {
  const bgra = Buffer.alloc(pixels.data.length)
  for (let i = 0; i < pixels.data.length; i += 4) {
    const alpha = pixels.data[i + 3]!
    bgra[i] = Math.round((pixels.data[i + 2]! * alpha) / 255)
    bgra[i + 1] = Math.round((pixels.data[i + 1]! * alpha) / 255)
    bgra[i + 2] = Math.round((pixels.data[i]! * alpha) / 255)
    bgra[i + 3] = alpha
  }
  const base64 = await app.evaluate(
    ({ nativeImage }, image) =>
      nativeImage
        .createFromBitmap(Buffer.from(image.bgra, 'base64'), { width: image.width, height: image.height })
        .toPNG()
        .toString('base64'),
    { bgra: bgra.toString('base64'), width: pixels.width, height: pixels.height },
  )
  return Buffer.from(base64, 'base64')
}

/** Opens an export stage in the capture window and returns its session ID. */
export function openStage(
  page: Page,
  spec: { width: number; height: number },
  fixedViewport: boolean,
): Promise<string> {
  return page.evaluate(
    async ({ stage, fixed }) => {
      const { desktop } = window as unknown as { desktop: DesktopApi }
      const { sessionId } = await desktop.request('capture.open', {
        stage,
        width: stage.width,
        height: stage.height,
        fixedViewport: fixed,
      })
      return sessionId
    },
    { stage: spec, fixed: fixedViewport },
  )
}

export async function closeStage(page: Page, sessionId: string) {
  await page.evaluate(async (id) => {
    const { desktop } = window as unknown as { desktop: DesktopApi }
    await desktop.request('capture.close', { sessionId: id })
  }, sessionId)
}

/** Returns the PNG of a capture image. */
export async function captureImage(page: Page, request: CaptureRequest): Promise<Buffer> {
  const base64 = await page.evaluate(async (input) => {
    const { desktop } = window as unknown as { desktop: DesktopApi }
    const { png } = await desktop.request('capture.image', input)
    return btoa(Array.from(new Uint8Array(png), (byte) => String.fromCharCode(byte)).join(''))
  }, request)
  return Buffer.from(base64, 'base64')
}

/** Returns the pixels of a capture video frame. */
export async function captureFrame(page: Page, request: CaptureRequest): Promise<Pixels> {
  const frame = await page.evaluate(async (input) => {
    const { desktop } = window as unknown as { desktop: DesktopApi }
    const { pixels, width, height } = await desktop.request('capture.frame', input)
    return { width, height, base64: btoa(Array.from(pixels, (byte) => String.fromCharCode(byte)).join('')) }
  }, request)
  return { width: frame.width, height: frame.height, data: Buffer.from(frame.base64, 'base64') }
}

/** Returns the number of different colours, without alpha, in every `step`th pixel. */
export function colourCount(pixels: Pixels, step = 1): number {
  const colours = new Set<number>()
  for (let i = 0; i < pixels.data.length; i += 4 * step) {
    colours.add((pixels.data[i]! << 16) | (pixels.data[i + 1]! << 8) | pixels.data[i + 2]!)
  }
  return colours.size
}
