import { describe, expect, it } from 'vitest'
import {
  bgraToRgba,
  MARKER_COUNT,
  MARKER_PX,
  markerColors,
  MAX_NATIVE_SIDE_PX,
  MAX_PAGE_ZOOM,
  planCapture,
  readMarker,
} from './capture-plan'

describe('capture plan', () => {
  it('gives the scale as the page zoom where Chromium allows it', () => {
    expect(planCapture({ width: 1000, height: 500 }, 2, true)).toEqual({
      pageZoom: 2,
      viewportScale: 1,
      stageWidth: 2000,
      stageHeight: 1000,
      windowWidth: 2000,
      windowHeight: 1000 + MARKER_PX,
      outputWidth: 2000,
      outputHeight: 1000,
    })
  })

  it('shrinks the viewport of a fixed stage below the smallest page zoom', () => {
    expect(planCapture({ width: 20_000, height: 10_000 }, 0.04, true)).toEqual({
      pageZoom: 1,
      viewportScale: 0.04,
      stageWidth: 800,
      stageHeight: 400,
      windowWidth: 800,
      windowHeight: 400 + MARKER_PX,
      outputWidth: 800,
      outputHeight: 400,
    })
  })

  it('shows a stage without a fixed viewport at the smallest page zoom and plans a smaller image', () => {
    expect(planCapture({ width: 1280, height: 720 }, 0.1, false)).toEqual({
      pageZoom: 0.25,
      viewportScale: 1,
      stageWidth: 320,
      stageHeight: 180,
      windowWidth: 320,
      windowHeight: 180 + MARKER_PX,
      outputWidth: 128,
      outputHeight: 72,
    })
  })

  it('keeps the window wide enough for the marker', () => {
    const plan = planCapture({ width: 1, height: 300 }, 1, true)
    expect(plan?.stageWidth).toBe(1)
    expect(plan?.windowWidth).toBe(MARKER_PX * 2)
  })

  it('refuses a scale over the largest page zoom', () => {
    expect(planCapture({ width: 100, height: 100 }, MAX_PAGE_ZOOM, true)?.pageZoom).toBe(MAX_PAGE_ZOOM)
    expect(planCapture({ width: 100, height: 100 }, MAX_PAGE_ZOOM + 0.5, true)).toBeNull()
  })

  it('refuses an image with a side over the limit', () => {
    expect(planCapture({ width: MAX_NATIVE_SIDE_PX, height: 100 }, 1, true)).not.toBeNull()
    expect(planCapture({ width: MAX_NATIVE_SIDE_PX / 2 + 1, height: 100 }, 2, true)).toBeNull()
  })
})

/** Returns the BGRA pixels of the marker area, with the left and the right square in two CSS colours. */
function markerArea(left: string, right: string): Uint8Array {
  const toBgra = (colour: string) => {
    const [red, green, blue] = colour.match(/\d+/g)!.map(Number)
    return [blue!, green!, red!, 255]
  }
  const pixels: number[] = []
  for (let y = 0; y < MARKER_PX; y++) {
    for (let x = 0; x < MARKER_PX * 2; x++) pixels.push(...toBgra(x < MARKER_PX ? left : right))
  }
  return new Uint8Array(pixels)
}

describe('capture marker', () => {
  it('reads each marker back from its two squares', () => {
    for (let marker = 0; marker < MARKER_COUNT; marker++) {
      expect(readMarker(markerArea(...markerColors(marker)))).toBe(marker)
    }
  })

  it('reads no marker from an area of one colour', () => {
    for (const colour of ['rgb(0, 0, 0)', 'rgb(255, 255, 255)', 'rgb(11, 12, 14)', 'rgb(250, 250, 247)']) {
      expect(readMarker(markerArea(colour, colour))).toBeNull()
    }
  })

  it('reads a marker from squares with colour changes of less than half the range', () => {
    expect(readMarker(markerArea('rgb(230, 40, 200)', 'rgb(20, 220, 60)'))).toBe(0b101)
  })

  it('swaps the red and the blue channel of each pixel', () => {
    expect([...bgraToRgba(new Uint8Array([10, 20, 30, 255, 0, 128, 255, 255]))]).toEqual([
      30, 20, 10, 255, 255, 128, 0, 255,
    ])
  })

  it('removes the premultiplied alpha of each pixel', () => {
    expect([...bgraToRgba(new Uint8Array([5, 5, 5, 5, 0, 64, 128, 128, 9, 9, 9, 0]))]).toEqual([
      255, 255, 255, 5, 255, 128, 0, 128, 0, 0, 0, 0,
    ])
  })
})
