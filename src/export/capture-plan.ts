/** The smallest page zoom of Chromium. */
export const MIN_PAGE_ZOOM = 0.25
/** The largest page zoom of Chromium. */
export const MAX_PAGE_ZOOM = 5
/** The longest side of an image that the capture window makes. */
export const MAX_NATIVE_SIDE_PX = 8192
/**
 * The side of each of the two marker squares in the bottom left corner of the capture window, in device-independent
 * pixels.
 */
export const MARKER_PX = 4
/** The number of different markers. Each render request of the capture window gets the next marker. */
export const MARKER_COUNT = 8

export interface CapturePlan {
  /** The zoom of the capture window. */
  pageZoom: number
  /** The factor for the size and the viewport of the stage. Below 1 only for a stage with a fixed viewport. */
  viewportScale: number
  /** The part of the frame that shows the stage, from the top left corner, in device-independent pixels. */
  stageWidth: number
  stageHeight: number
  /** The content size of the capture window: the stage, and a row for the marker below it. */
  windowWidth: number
  windowHeight: number
  /** The size of the image. */
  outputWidth: number
  outputHeight: number
}

/**
 * Plans how the capture window shows a stage for an image at `scale` image pixels for each stage pixel.
 *
 * The page zoom gives the scale from {@link MIN_PAGE_ZOOM} to {@link MAX_PAGE_ZOOM}. Below {@link MIN_PAGE_ZOOM}, a
 * stage with a fixed viewport gets a smaller size and viewport. Any other stage shows at {@link MIN_PAGE_ZOOM}, and the
 * main process makes the image smaller.
 *
 * @returns The plan, or `null` when the image is too large for the capture window or the scale is over the largest page
 *   zoom.
 */
export function planCapture(
  stage: { width: number; height: number },
  scale: number,
  fixedViewport: boolean,
): CapturePlan | null {
  const outputWidth = Math.max(1, Math.round(stage.width * scale))
  const outputHeight = Math.max(1, Math.round(stage.height * scale))
  if (scale > MAX_PAGE_ZOOM || outputWidth > MAX_NATIVE_SIDE_PX || outputHeight > MAX_NATIVE_SIDE_PX) return null
  const small = scale < MIN_PAGE_ZOOM && fixedViewport
  const pageZoom = small ? 1 : Math.max(MIN_PAGE_ZOOM, scale)
  const viewportScale = small ? scale : 1
  const stageWidth = Math.max(1, Math.ceil(stage.width * viewportScale * pageZoom))
  const stageHeight = Math.max(1, Math.ceil(stage.height * viewportScale * pageZoom))
  return {
    pageZoom,
    viewportScale,
    stageWidth,
    stageHeight,
    windowWidth: Math.max(stageWidth, MARKER_PX * 2),
    windowHeight: stageHeight + MARKER_PX,
    outputWidth,
    outputHeight,
  }
}

function colour(value: number): string {
  const channel = (bit: number) => (value & bit ? 255 : 0)
  return `rgb(${channel(1)}, ${channel(2)}, ${channel(4)})`
}

/**
 * Returns the CSS colours of the two marker squares, left and right. Each bit of the marker sets one colour channel of
 * the left square to full. The right square has the inverse colour.
 */
export function markerColors(marker: number): [string, string] {
  return [colour(marker), colour(MARKER_COUNT - 1 - marker)]
}

/**
 * Reads the marker from the BGRA pixels of the two marker squares.
 *
 * @param pixels - The BGRA pixels of an area of `MARKER_PX * 2` by `MARKER_PX`, as `NativeImage.toBitmap()` gives them.
 * @returns The marker, or `null` when the right square does not have the inverse colour of the left square.
 */
export function readMarker(pixels: Uint8Array): number | null {
  const middle = MARKER_PX / 2
  const valueAt = (x: number) => {
    const offset = (middle * MARKER_PX * 2 + x) * 4
    const full = (index: number) => (pixels[offset + index] ?? 0) >= 128
    return (full(2) ? 1 : 0) | (full(1) ? 2 : 0) | (full(0) ? 4 : 0)
  }
  const left = valueAt(middle)
  return valueAt(MARKER_PX + middle) === MARKER_COUNT - 1 - left ? left : null
}

/** Returns a copy of premultiplied BGRA pixels as RGBA pixels with straight alpha, the form of `ImageData`. */
export function bgraToRgba(pixels: Uint8Array): Uint8Array {
  const out = new Uint8Array(pixels.length)
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3]!
    const factor = alpha === 0 ? 0 : 255 / alpha
    out[i] = Math.min(255, Math.round(pixels[i + 2]! * factor))
    out[i + 1] = Math.min(255, Math.round(pixels[i + 1]! * factor))
    out[i + 2] = Math.min(255, Math.round(pixels[i]! * factor))
    out[i + 3] = alpha
  }
  return out
}
