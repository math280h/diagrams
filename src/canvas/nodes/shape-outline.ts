import type { ShapeKind } from '@/model/schema'

export function shapeOutline(kind: ShapeKind, width: number, height: number): { outline: string; detail?: string } {
  const w = Math.max(1, width - 1)
  const h = Math.max(1, height - 1)
  const o = 0.5
  const rect = (radius: number) => {
    const r = Math.min(radius, w / 2, h / 2)
    return `M${o + r},${o} H${o + w - r} A${r},${r} 0 0 1 ${o + w},${o + r} V${o + h - r} A${r},${r} 0 0 1 ${o + w - r},${o + h} H${o + r} A${r},${r} 0 0 1 ${o},${o + h - r} V${o + r} A${r},${r} 0 0 1 ${o + r},${o} Z`
  }
  switch (kind) {
    case 'rectangle':
      return { outline: rect(3) }
    case 'rounded':
      return { outline: rect(14) }
    case 'pill':
      return { outline: rect(h / 2) }
    case 'circle':
      return {
        outline: `M${o + w / 2},${o} A${w / 2},${h / 2} 0 1 1 ${o + w / 2},${o + h} A${w / 2},${h / 2} 0 1 1 ${o + w / 2},${o} Z`,
      }
    case 'diamond':
      return { outline: `M${o + w / 2},${o} L${o + w},${o + h / 2} L${o + w / 2},${o + h} L${o},${o + h / 2} Z` }
    case 'hexagon': {
      const inset = Math.min(w * 0.22, h * 0.5)
      return {
        outline: `M${o + inset},${o} L${o + w - inset},${o} L${o + w},${o + h / 2} L${o + w - inset},${o + h} L${o + inset},${o + h} L${o},${o + h / 2} Z`,
      }
    }
    case 'parallelogram': {
      const skew = Math.min(w * 0.16, 28)
      return { outline: `M${o + skew},${o} L${o + w},${o} L${o + w - skew},${o + h} L${o},${o + h} Z` }
    }
    case 'cylinder': {
      const ry = Math.min(14, h * 0.16)
      return {
        outline: `M${o},${o + ry} A${w / 2},${ry} 0 0 1 ${o + w},${o + ry} V${o + h - ry} A${w / 2},${ry} 0 0 1 ${o},${o + h - ry} Z`,
        detail: `M${o},${o + ry} A${w / 2},${ry} 0 0 0 ${o + w},${o + ry}`,
      }
    }
  }
}
