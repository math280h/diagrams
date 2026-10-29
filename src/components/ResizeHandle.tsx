import { useRef } from 'react'
import { cn } from '@/lib/utils'

const KEY_STEP_PX = 16
const KEY_LARGE_STEP_PX = 64

export interface ResizeHandleProps {
  /** The accessible name, for example "Resize properties". */
  label: string
  /** The direction of the line: `vertical` changes a width, `horizontal` changes a height. */
  orientation: 'vertical' | 'horizontal'
  value: number
  min: number
  max: number
  /** The size that a double-click or the Enter key gives back. */
  defaultValue: number
  /**
   * The sign of the size change when the pointer moves right or down: `-1` for a panel at the right or at the bottom
   * of its handle.
   */
  direction: 1 | -1
  onChange: (value: number) => void
  className?: string
}

function clamp(value: number, min: number, max: number) {
  return Math.round(Math.min(max, Math.max(min, value)))
}

/** Renders a drag handle that resizes a panel with the pointer or the keyboard. */
export function ResizeHandle({
  label,
  orientation,
  value,
  min,
  max,
  defaultValue,
  direction,
  onChange,
  className,
}: ResizeHandleProps) {
  const drag = useRef<{ start: number; value: number } | null>(null)
  const vertical = orientation === 'vertical'
  const position = (event: React.PointerEvent) => (vertical ? event.clientX : event.clientY)
  const [less, more] = vertical
    ? direction > 0
      ? ['ArrowLeft', 'ArrowRight']
      : ['ArrowRight', 'ArrowLeft']
    : direction > 0
      ? ['ArrowUp', 'ArrowDown']
      : ['ArrowDown', 'ArrowUp']

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuenow={Math.round(value)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      data-slot="resize-handle"
      className={cn(
        'absolute z-20 touch-none bg-transparent outline-none transition-colors hover:bg-ring/40 focus-visible:bg-ring active:bg-ring',
        vertical ? 'inset-y-0 w-1 cursor-col-resize' : 'inset-x-0 h-1 cursor-row-resize',
        className,
      )}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { start: position(event), value }
      }}
      onPointerMove={(event) => {
        if (!drag.current) return
        onChange(clamp(drag.current.value + direction * (position(event) - drag.current.start), min, max))
      }}
      onPointerUp={() => {
        drag.current = null
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
      onDoubleClick={() => onChange(clamp(defaultValue, min, max))}
      onKeyDown={(event) => {
        const step = event.shiftKey ? KEY_LARGE_STEP_PX : KEY_STEP_PX
        let next: number | null = null
        if (event.key === less) next = value - step
        else if (event.key === more) next = value + step
        else if (event.key === 'Home') next = min
        else if (event.key === 'End') next = max
        else if (event.key === 'Enter') next = defaultValue
        if (next === null) return
        event.preventDefault()
        onChange(clamp(next, min, max))
      }}
    />
  )
}
