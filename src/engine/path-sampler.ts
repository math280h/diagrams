export interface PathPoint {
  x: number
  y: number
  /** The tangent direction. */
  angleRad: number
}

/** Points at equal distances along a path. */
export interface ArcTable {
  xs: Float32Array
  ys: Float32Array
  angles: Float32Array
  lengthPx: number
  minX: number
  minY: number
  maxX: number
  maxY: number
}

type Segment =
  | { kind: 'line'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'quad'; x0: number; y0: number; cx: number; cy: number; x1: number; y1: number }
  | {
      kind: 'cubic'
      x0: number
      y0: number
      c1x: number
      c1y: number
      c2x: number
      c2y: number
      x1: number
      y1: number
    }

const TOKEN_PATTERN = /[MLQCZ]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi
const CURVE_SUBDIVISIONS = 24
const TABLE_SIZE = 128

/**
 * Parses SVG path data into line and curve segments.
 *
 * The function reads only the absolute commands M, L, Q, C and Z.
 */
export function parsePath(d: string): Segment[] {
  // React Flow writes only M, L, Q and C commands in the path data.
  const tokens = d.match(TOKEN_PATTERN) ?? []
  const segments: Segment[] = []
  let command = ''
  let index = 0
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  const next = () => Number(tokens[index++])

  while (index < tokens.length) {
    const token = tokens[index]!
    if (/^[a-z]$/i.test(token)) {
      command = token.toUpperCase()
      index++
      if (command === 'Z') {
        if (x !== startX || y !== startY) {
          segments.push({ kind: 'line', x0: x, y0: y, x1: startX, y1: startY })
        }
        x = startX
        y = startY
      }
      continue
    }
    switch (command) {
      case 'M': {
        x = next()
        y = next()
        startX = x
        startY = y
        command = 'L'
        break
      }
      case 'L': {
        const x1 = next()
        const y1 = next()
        segments.push({ kind: 'line', x0: x, y0: y, x1, y1 })
        x = x1
        y = y1
        break
      }
      case 'Q': {
        const cx = next()
        const cy = next()
        const x1 = next()
        const y1 = next()
        segments.push({ kind: 'quad', x0: x, y0: y, cx, cy, x1, y1 })
        x = x1
        y = y1
        break
      }
      case 'C': {
        const c1x = next()
        const c1y = next()
        const c2x = next()
        const c2y = next()
        const x1 = next()
        const y1 = next()
        segments.push({ kind: 'cubic', x0: x, y0: y, c1x, c1y, c2x, c2y, x1, y1 })
        x = x1
        y = y1
        break
      }
      default:
        index++
    }
  }
  return segments
}

function evaluate(segment: Segment, t: number): [number, number] {
  switch (segment.kind) {
    case 'line':
      return [segment.x0 + (segment.x1 - segment.x0) * t, segment.y0 + (segment.y1 - segment.y0) * t]
    case 'quad': {
      const mt = 1 - t
      return [
        mt * mt * segment.x0 + 2 * mt * t * segment.cx + t * t * segment.x1,
        mt * mt * segment.y0 + 2 * mt * t * segment.cy + t * t * segment.y1,
      ]
    }
    case 'cubic': {
      const mt = 1 - t
      const a = mt * mt * mt
      const b = 3 * mt * mt * t
      const c = 3 * mt * t * t
      const e = t * t * t
      return [
        a * segment.x0 + b * segment.c1x + c * segment.c2x + e * segment.x1,
        a * segment.y0 + b * segment.c1y + c * segment.c2y + e * segment.y1,
      ]
    }
  }
}

export function buildArcTable(d: string, size = TABLE_SIZE): ArcTable {
  const segments = parsePath(d)
  const polyX: number[] = []
  const polyY: number[] = []
  const polyS: number[] = []
  let total = 0

  for (const segment of segments) {
    const steps = segment.kind === 'line' ? 1 : CURVE_SUBDIVISIONS
    for (let i = polyX.length === 0 ? 0 : 1; i <= steps; i++) {
      const [px, py] = evaluate(segment, i / steps)
      if (polyX.length > 0) {
        total += Math.hypot(px - polyX[polyX.length - 1]!, py - polyY[polyY.length - 1]!)
      }
      polyX.push(px)
      polyY.push(py)
      polyS.push(total)
    }
  }

  const xs = new Float32Array(size)
  const ys = new Float32Array(size)
  const angles = new Float32Array(size)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  if (polyX.length === 0) {
    return { xs, ys, angles, lengthPx: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }

  let cursor = 0
  for (let i = 0; i < size; i++) {
    const target = (i / (size - 1)) * total
    while (cursor < polyS.length - 2 && polyS[cursor + 1]! < target) cursor++
    const s0 = polyS[cursor]!
    const s1 = polyS[Math.min(cursor + 1, polyS.length - 1)]!
    const span = s1 - s0
    const f = span > 0 ? (target - s0) / span : 0
    const x0 = polyX[cursor]!
    const y0 = polyY[cursor]!
    const x1 = polyX[Math.min(cursor + 1, polyX.length - 1)]!
    const y1 = polyY[Math.min(cursor + 1, polyY.length - 1)]!
    const x = x0 + (x1 - x0) * f
    const y = y0 + (y1 - y0) * f
    xs[i] = x
    ys[i] = y
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  for (let i = 0; i < size; i++) {
    const a = Math.max(0, i - 1)
    const b = Math.min(size - 1, i + 1)
    angles[i] = Math.atan2(ys[b]! - ys[a]!, xs[b]! - xs[a]!)
  }

  return { xs, ys, angles, lengthPx: total, minX, minY, maxX, maxY }
}

/**
 * Returns the point at a fraction of the path length.
 *
 * @param table - The table from {@link buildArcTable}.
 * @param u - The fraction of the path length, from 0 to 1. The function clamps other values.
 * @param out - The object that receives the result.
 */
export function pointAt(table: ArcTable, u: number, out: PathPoint = { x: 0, y: 0, angleRad: 0 }): PathPoint {
  const last = table.xs.length - 1
  const f = Math.min(1, Math.max(0, u)) * last
  const i = Math.min(last - 1, Math.floor(f))
  if (i < 0) {
    out.x = table.xs[0] ?? 0
    out.y = table.ys[0] ?? 0
    out.angleRad = table.angles[0] ?? 0
    return out
  }
  const frac = f - i
  out.x = table.xs[i]! + (table.xs[i + 1]! - table.xs[i]!) * frac
  out.y = table.ys[i]! + (table.ys[i + 1]! - table.ys[i]!) * frac
  out.angleRad = table.angles[frac < 0.5 ? i : i + 1]!
  return out
}
