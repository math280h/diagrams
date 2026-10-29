import type { ReactNode } from 'react'
import { ResizeHandle } from '@/components/ResizeHandle'
import { useWindowSize } from '@/lib/use-window-size'
import { cn } from '@/lib/utils'
import { DEFAULT_SIDE_PANEL_WIDTH, useSettings } from '@/store/settings-store'

const MIN_WIDTH_PX = 240
const MAX_WIDTH_PX = 560
const MAX_WINDOW_SHARE = 0.45

/**
 * Renders a panel at a side of the editor canvas, with a handle that resizes all side panels. On a narrow screen the
 * panel sits above the canvas (`left`) or below it (`right`).
 */
export function SidePanel({
  side,
  label,
  className,
  children,
}: {
  side: 'left' | 'right'
  label: string
  className?: string
  children: ReactNode
}) {
  const width = useSettings((state) => state.sidePanelWidth)
  const setWidth = useSettings((state) => state.setSidePanelWidth)
  const viewport = useWindowSize()
  const maxWidth = Math.max(MIN_WIDTH_PX, Math.min(MAX_WIDTH_PX, viewport.width * MAX_WINDOW_SHARE))
  const shown = Math.min(maxWidth, Math.max(MIN_WIDTH_PX, width))
  return (
    <aside
      aria-label={label}
      className={cn(
        'relative z-10 flex shrink-0 flex-col overflow-hidden bg-panel md:h-full md:w-(--side-panel-width)',
        side === 'right' ? 'max-md:h-[40%] max-md:border-t md:border-l' : 'max-md:h-[35%] max-md:border-b md:border-r',
        className,
      )}
      style={{ '--side-panel-width': `${shown}px` } as React.CSSProperties}
    >
      <ResizeHandle
        label={`Resize ${label.toLowerCase()}`}
        orientation="vertical"
        value={shown}
        min={MIN_WIDTH_PX}
        max={maxWidth}
        defaultValue={DEFAULT_SIDE_PANEL_WIDTH}
        direction={side === 'right' ? -1 : 1}
        onChange={setWidth}
        className={cn('max-md:hidden', side === 'right' ? 'left-0' : 'right-0')}
      />
      {children}
    </aside>
  )
}
