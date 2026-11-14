import { useStore, useStoreApi, type Transform } from '@xyflow/react'
import { useLayoutEffect, useRef } from 'react'

interface GridBackgroundProps {
  variant: 'dots' | 'lines'
  /** The distance between two dots or lines, in flow units. */
  gap: number
  /** The diameter of a dot, in flow units. */
  size?: number
  lineWidth?: number
  color: string
}

/**
 * Draws the SVG of the React Flow `Background` for the `dots` and `lines` variants. It writes the pattern for each
 * viewport change directly to the DOM, without a React render.
 *
 * Put this component inside the `ReactFlow` element.
 */
export function GridBackground({ variant, gap, size = 1, lineWidth = 1, color }: GridBackgroundProps) {
  const store = useStoreApi()
  const patternId = `pattern-${useStore((state) => state.rfId)}`
  const patternRef = useRef<SVGPatternElement>(null)
  const dotRef = useRef<SVGCircleElement>(null)
  const lineRef = useRef<SVGPathElement>(null)

  useLayoutEffect(() => {
    const set = (element: Element | null, name: string, value: string) => {
      if (element && element.getAttribute(name) !== value) element.setAttribute(name, value)
    }
    const write = ([x, y, zoom]: Transform) => {
      const pattern = patternRef.current
      const scaledGap = gap * zoom || 1
      const half = scaledGap / 2
      set(pattern, 'x', String(x % scaledGap))
      set(pattern, 'y', String(y % scaledGap))
      set(pattern, 'width', String(scaledGap))
      set(pattern, 'height', String(scaledGap))
      set(pattern, 'patternTransform', `translate(-${half},-${half})`)
      const radius = String((size * zoom) / 2)
      for (const name of ['cx', 'cy', 'r']) set(dotRef.current, name, radius)
      set(lineRef.current, 'd', `M${half} 0 V${scaledGap} M0 ${half} H${scaledGap}`)
    }
    let written = store.getState().transform
    write(written)
    return store.subscribe((state) => {
      if (state.transform === written) return
      written = state.transform
      write(written)
    })
  }, [store, gap, size])

  return (
    <svg
      className="react-flow__background"
      style={
        {
          position: 'absolute',
          width: '100%',
          height: '100%',
          top: 0,
          left: 0,
          '--xy-background-pattern-color-props': color,
        } as React.CSSProperties
      }
      data-testid="rf__background"
    >
      <pattern ref={patternRef} id={patternId} patternUnits="userSpaceOnUse">
        {variant === 'dots' ? (
          <circle ref={dotRef} className="react-flow__background-pattern dots" />
        ) : (
          <path ref={lineRef} strokeWidth={lineWidth} className="react-flow__background-pattern lines" />
        )}
      </pattern>
      <rect x="0" y="0" width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  )
}
