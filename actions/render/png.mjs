import { deflateSync, inflateSync } from 'node:zlib'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
const BOX_COLOR = [229, 72, 77]
const UP_FILTER = 2

/**
 * Reads an 8-bit RGB or RGBA PNG without interlace, as Chromium writes screenshots.
 *
 * @returns The size and the pixels as RGBA bytes.
 * @throws Error If the PNG has another colour type, bit depth or interlace.
 */
export function decodePng(png) {
  // A PNG file is an 8 byte signature and chunks of length, type, data and CRC. The IDAT data is one zlib stream of
  // scanlines, and each scanline starts with a filter type from 0 to 4.
  let offset = 8
  let width = 0
  let height = 0
  let channels = 0
  const parts = []
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('latin1', offset + 4, offset + 8)
    const data = png.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      const [bitDepth, colorType, , , interlace] = data.subarray(8)
      if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`The PNG has a format that this reader does not support (colour type ${colorType}).`)
      }
      channels = colorType === 6 ? 4 : 3
    } else if (type === 'IDAT') {
      parts.push(data)
    }
    offset += length + 12
  }
  const raw = inflateSync(Buffer.concat(parts))
  const stride = width * channels
  const pixels = new Uint8ClampedArray(width * height * 4)
  let previous = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const current = new Uint8Array(stride)
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? current[x - channels] : 0
      const up = previous[x]
      const upLeft = x >= channels ? previous[x - channels] : 0
      let predictor = 0
      if (filter === 1) predictor = left
      else if (filter === 2) predictor = up
      else if (filter === 3) predictor = (left + up) >> 1
      else if (filter === 4) {
        const estimate = left + up - upLeft
        const toLeft = Math.abs(estimate - left)
        const toUp = Math.abs(estimate - up)
        const toUpLeft = Math.abs(estimate - upLeft)
        predictor = toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft
      }
      current[x] = (line[x] + predictor) & 0xff
    }
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4
      pixels[at] = current[x * channels]
      pixels[at + 1] = current[x * channels + 1]
      pixels[at + 2] = current[x * channels + 2]
      pixels[at + 3] = channels === 4 ? current[x * channels + 3] : 255
    }
    previous = current
  }
  return { width, height, pixels }
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([length, typed, crc])
}

/** Writes an image as a PNG, with an alpha channel only when a pixel is not opaque. */
export function encodePng({ width, height, pixels }) {
  let opaque = true
  for (let at = 3; at < pixels.length && opaque; at += 4) opaque = pixels[at] === 255
  const channels = opaque ? 3 : 4
  const stride = width * channels
  const raw = Buffer.alloc((stride + 1) * height)
  let previous = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const current = new Uint8Array(stride)
    for (let x = 0; x < width; x++) {
      for (let channel = 0; channel < channels; channel++) {
        current[x * channels + channel] = pixels[(y * width + x) * 4 + channel]
      }
    }
    const row = y * (stride + 1)
    raw[row] = UP_FILTER
    for (let at = 0; at < stride; at++) raw[row + 1 + at] = (current[at] - previous[at]) & 0xff
    previous = current
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = opaque ? 2 : 6
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function samePixel(a, ax, ay, b, bx, by, tolerance) {
  if (ax >= a.width || bx >= b.width) return false
  const first = (ay * a.width + ax) * 4
  const second = (by * b.width + bx) * 4
  for (let channel = 0; channel < 4; channel++) {
    if (Math.abs(a.pixels[first + channel] - b.pixels[second + channel]) > tolerance) return false
  }
  return true
}

// FNV-1a over the pixels of each row, with each channel cut to 16 levels.
function rowHashes(image) {
  const hashes = new Uint32Array(image.height)
  const stride = image.width * 4
  for (let y = 0; y < image.height; y++) {
    let hash = 0x811c9dc5
    for (let at = y * stride; at < (y + 1) * stride; at++) hash = Math.imul(hash ^ (image.pixels[at] >> 4), 0x01000193)
    hashes[y] = hash >>> 0
  }
  return hashes
}

function longestIncreasing(pairs) {
  const tails = []
  const previous = Array.from({ length: pairs.length }, () => -1)
  pairs.forEach(([, value], index) => {
    let low = 0
    let high = tails.length
    while (low < high) {
      const middle = (low + high) >> 1
      if (pairs[tails[middle]][1] < value) low = middle + 1
      else high = middle
    }
    if (low > 0) previous[index] = tails[low - 1]
    tails[low] = index
  })
  const result = []
  for (let index = tails.at(-1) ?? -1; index !== -1; index = previous[index]) result.push(pairs[index])
  return result.reverse()
}

function uniqueAnchors(first, a0, a1, second, b0, b1) {
  const rows = new Map()
  for (let a = a0; a < a1; a++) {
    const row = rows.get(first[a]) ?? { inFirst: 0, inSecond: 0, a, b: -1 }
    row.inFirst++
    rows.set(first[a], row)
  }
  for (let b = b0; b < b1; b++) {
    const row = rows.get(second[b])
    if (!row) continue
    row.inSecond++
    row.b = b
  }
  const pairs = [...rows.values()]
    .filter((row) => row.inFirst === 1 && row.inSecond === 1)
    .map((row) => [row.a, row.b])
    .toSorted((x, y) => x[0] - y[0])
  return longestIncreasing(pairs)
}

/** Pairs the rows of two images that look the same, in order, as a line diff pairs the lines of two texts. */
function matchRows(first, second) {
  const pairs = []
  const walk = (a0, a1, b0, b1) => {
    while (a0 < a1 && b0 < b1 && first[a0] === second[b0]) pairs.push([a0++, b0++])
    const tail = []
    while (a0 < a1 && b0 < b1 && first[a1 - 1] === second[b1 - 1]) tail.push([--a1, --b1])
    if (a0 < a1 && b0 < b1) {
      const anchors = uniqueAnchors(first, a0, a1, second, b0, b1)
      let a = a0
      let b = b0
      for (const [anchorA, anchorB] of anchors) {
        walk(a, anchorA, b, anchorB)
        pairs.push([anchorA, anchorB])
        a = anchorA + 1
        b = anchorB + 1
      }
      if (anchors.length > 0) walk(a, a1, b, b1)
    }
    pairs.push(...tail.reverse())
  }
  walk(0, first.length, 0, second.length)
  return pairs
}

function unmatchedRuns(pairs, firstLength, secondLength) {
  const runs = []
  let a = 0
  let b = 0
  for (const [pairA, pairB] of [...pairs, [firstLength, secondLength]]) {
    if (pairA > a || pairB > b) runs.push({ a0: a, a1: pairA, b0: b, b1: pairB })
    a = pairA + 1
    b = pairB + 1
  }
  return runs
}

function cellGrid(image, cellPx) {
  const columns = Math.ceil(image.width / cellPx)
  const rows = Math.ceil(image.height / cellPx)
  return { columns, rows, cellPx, width: image.width, height: image.height, counts: new Uint32Array(columns * rows) }
}

function addPixel(grid, x, y) {
  grid.counts[Math.floor(y / grid.cellPx) * grid.columns + Math.floor(x / grid.cellPx)]++
}

/** Groups the cells with changed pixels that are less than `gapPx` apart, and returns a rectangle for each group. */
function cellGroups(grid, gapPx) {
  const { columns, rows, cellPx, counts } = grid
  const reach = Math.ceil(gapPx / cellPx)
  const seen = new Uint8Array(counts.length)
  const groups = []
  for (let start = 0; start < counts.length; start++) {
    if (counts[start] === 0 || seen[start]) continue
    seen[start] = 1
    const queue = [start]
    let group = null
    while (queue.length > 0) {
      const cell = queue.pop()
      const column = cell % columns
      const row = Math.floor(cell / columns)
      const rect = {
        x: column * cellPx,
        y: row * cellPx,
        width: Math.min(cellPx, grid.width - column * cellPx),
        height: Math.min(cellPx, grid.height - row * cellPx),
        pixels: counts[cell],
      }
      group = group ? union(group, rect) : rect
      for (let near = Math.max(0, row - reach); near <= Math.min(rows - 1, row + reach); near++) {
        for (let side = Math.max(0, column - reach); side <= Math.min(columns - 1, column + reach); side++) {
          const next = near * columns + side
          if (counts[next] === 0 || seen[next]) continue
          seen[next] = 1
          queue.push(next)
        }
      }
    }
    groups.push(group)
  }
  return groups
}

/**
 * Adds the changed pixels of a run of unpaired rows to the grid of each image. Rows that both images have in the run
 * are compared pixel by pixel. Rows that only one image has count where they differ from their first pixel, the
 * background. A change on one side only gives the other side a rectangle without height where the change would be.
 */
function addRun(a, b, run, grids, markers, tolerance) {
  const paired = Math.min(run.a1 - run.a0, run.b1 - run.b0)
  const width = Math.max(a.width, b.width)
  const counted = { before: 0, after: 0 }
  const columns = { before: [Infinity, -1], after: [Infinity, -1] }
  const add = (side, image, x, y) => {
    if (x >= image.width) return
    addPixel(grids[side], x, y)
    counted[side]++
    columns[side] = [Math.min(columns[side][0], x), Math.max(columns[side][1], x)]
  }
  for (let row = 0; row < paired; row++) {
    for (let x = 0; x < width; x++) {
      if (samePixel(a, x, run.a0 + row, b, x, run.b0 + row, tolerance)) continue
      add('before', a, x, run.a0 + row)
      add('after', b, x, run.b0 + row)
    }
  }
  for (let y = run.a0 + paired; y < run.a1; y++) {
    for (let x = 1; x < a.width; x++) if (!samePixel(a, x, y, a, 0, y, tolerance)) add('before', a, x, y)
  }
  for (let y = run.b0 + paired; y < run.b1; y++) {
    for (let x = 1; x < b.width; x++) if (!samePixel(b, x, y, b, 0, y, tolerance)) add('after', b, x, y)
  }
  const marker = (side, y) => {
    const [left, right] = columns[side]
    return { x: left, y, width: right - left + 1, height: 0, pixels: counted[side] }
  }
  if (counted.after > 0 && counted.before === 0) markers.before.push(marker('after', run.a0 + paired))
  if (counted.before > 0 && counted.after === 0) markers.after.push(marker('before', run.b0 + paired))
}

function gapBetween(a, b) {
  const x = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width))
  const y = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height))
  return Math.max(x, y)
}

function union(a, b) {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
    pixels: a.pixels + b.pixels,
  }
}

function mergeClose(regions, gapPx) {
  for (let merged = true; merged;) {
    merged = false
    for (let first = 0; first < regions.length && !merged; first++) {
      for (let second = first + 1; second < regions.length && !merged; second++) {
        if (gapBetween(regions[first], regions[second]) > gapPx) continue
        regions[first] = union(regions[first], regions[second])
        regions.splice(second, 1)
        merged = true
      }
    }
  }
}

function mergeRegions(found, { gapPx, strayPixels, maxRegions }) {
  const regions = found.filter((region) => region.pixels > strayPixels)
  mergeClose(regions, gapPx)
  while (regions.length > maxRegions) {
    let pair = [0, 1]
    let nearest = Infinity
    for (let first = 0; first < regions.length; first++) {
      for (let second = first + 1; second < regions.length; second++) {
        const gap = gapBetween(regions[first], regions[second])
        if (gap < nearest) [nearest, pair] = [gap, [first, second]]
      }
    }
    regions[pair[0]] = union(regions[pair[0]], regions[pair[1]])
    regions.splice(pair[1], 1)
    mergeClose(regions, gapPx)
  }
  return regions
    .map(({ x, y, width, height }) => ({ x, y, width, height }))
    .toSorted((first, second) => first.y - second.y || first.x - second.x)
}

/**
 * Returns the rectangles around the parts of two decoded images that changed, on each image.
 *
 * The rows of the images are paired first, as a line diff pairs the lines of two texts, so that content that only
 * moved up or down does not count as changed. A rectangle without height marks the place of a change that only the
 * other image has.
 *
 * @param tolerance - The largest channel difference, from 0 to 255, that counts as the same.
 * @param cellPx - The side of the squares that the changed pixels are grouped in.
 * @param gapPx - Changes closer than this share one rectangle.
 * @param strayPixels - A change of at most this many pixels is noise at a text edge or a rounded corner, as in
 *   {@link samePixels}.
 * @param maxRegions - The most rectangles on each image. The nearest rectangles merge until no more are left.
 * @returns The rectangles on the before and on the after image, in pixels, from the top.
 */
export function changedRegions(
  a,
  b,
  { tolerance = 8, cellPx = 16, gapPx = 32, strayPixels = 16, maxRegions = 8 } = {},
) {
  const runs = unmatchedRuns(matchRows(rowHashes(a), rowHashes(b)), a.height, b.height)
  const grids = { before: cellGrid(a, cellPx), after: cellGrid(b, cellPx) }
  const markers = { before: [], after: [] }
  for (const run of runs) addRun(a, b, run, grids, markers, tolerance)
  const limits = { gapPx, strayPixels, maxRegions }
  return {
    before: mergeRegions([...cellGroups(grids.before, gapPx), ...markers.before], limits),
    after: mergeRegions([...cellGroups(grids.after, gapPx), ...markers.after], limits),
  }
}

/**
 * Returns a copy of a decoded image with an outline around each rectangle that has a height. An outline that would
 * leave the image stays at its edge.
 *
 * @param paddingPx - The space between a rectangle and its outline.
 */
export function drawBoxes(image, regions, { lineWidthPx = 3, paddingPx = 4 } = {}) {
  const pixels = new Uint8ClampedArray(image.pixels)
  const paint = (x, y) => pixels.set([...BOX_COLOR, 255], (y * image.width + x) * 4)
  for (const region of regions) {
    if (region.width === 0 || region.height === 0) continue
    const left = Math.max(0, region.x - paddingPx - lineWidthPx)
    const top = Math.max(0, region.y - paddingPx - lineWidthPx)
    const right = Math.min(image.width - 1, region.x + region.width + paddingPx + lineWidthPx - 1)
    const bottom = Math.min(image.height - 1, region.y + region.height + paddingPx + lineWidthPx - 1)
    for (let line = 0; line < lineWidthPx; line++) {
      for (let x = left; x <= right; x++) {
        paint(x, Math.min(bottom, top + line))
        paint(x, Math.max(top, bottom - line))
      }
      for (let y = top; y <= bottom; y++) {
        paint(Math.min(right, left + line), y)
        paint(Math.max(left, right - line), y)
      }
    }
  }
  return { width: image.width, height: image.height, pixels }
}

/** Returns the rows from `top` of a decoded image, at most `height` of them. */
export function cropRows(image, top, height) {
  const start = Math.max(0, Math.min(top, image.height))
  const rows = Math.max(0, Math.min(height, image.height - start))
  const begin = start * image.width * 4
  return {
    width: image.width,
    height: rows,
    pixels: image.pixels.slice(begin, begin + rows * image.width * 4),
  }
}

/**
 * Returns the rows of a tall image to show: the rows of the changes with a margin, at least `minHeightPx` and at most
 * `maxHeightPx` of them. Without changes, it gives the top rows.
 */
export function viewRows(regions, imageHeight, { marginPx, minHeightPx, maxHeightPx }) {
  if (regions.length === 0) return { top: 0, height: Math.min(imageHeight, maxHeightPx) }
  const first = Math.min(...regions.map((region) => region.y))
  const last = Math.max(...regions.map((region) => region.y + region.height))
  let top = Math.max(0, first - marginPx)
  let height = Math.min(imageHeight, last + marginPx) - top
  if (height < minHeightPx) {
    top = Math.max(0, Math.min(imageHeight - minHeightPx, top - (minHeightPx - height) / 2))
    height = Math.min(imageHeight - top, minHeightPx)
  }
  return { top: Math.round(top), height: Math.round(Math.min(height, maxHeightPx)) }
}

/**
 * Returns true if two PNG images look the same: the same size, and at most `strayPixels` pixels with a colour channel
 * that differs by more than the tolerance. Text, colour and layout changes move many pixels by much more than the
 * tolerance; two renders of the same page can differ in a few anti-aliased pixels at a rounded corner.
 *
 * @param tolerance - The largest channel difference, from 0 to 255, that counts as the same.
 * @param strayPixels - The number of pixels over the tolerance that still count as the same.
 */
export function samePixels(a, b, tolerance = 8, strayPixels = 16) {
  if (a.equals(b)) return true
  const first = decodePng(a)
  const second = decodePng(b)
  if (first.width !== second.width || first.height !== second.height) return false
  let different = 0
  for (let pixel = 0; pixel < first.pixels.length; pixel += 4) {
    for (let channel = pixel; channel < pixel + 4; channel++) {
      if (Math.abs(first.pixels[channel] - second.pixels[channel]) <= tolerance) continue
      different++
      if (different > strayPixels) return false
      break
    }
  }
  return true
}
