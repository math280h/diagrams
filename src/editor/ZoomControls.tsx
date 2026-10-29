import { useReactFlow, useStore, useViewport } from '@xyflow/react'
import { Map as MapIcon, Maximize, Minus, Plus } from 'lucide-react'
import { MINIMAP_MIN_NODES } from '@/canvas/Minimap'
import { useSettings } from '@/store/settings-store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useFitToScreen } from './fit'
import { KEYS } from '@/lib/shortcut-keys'

export function ZoomControls() {
  const { zoom } = useViewport()
  const { zoomIn, zoomOut, zoomTo } = useReactFlow()
  const fitToScreen = useFitToScreen()
  const large = useStore((state) => state.nodes.length >= MINIMAP_MIN_NODES)
  const showMinimap = useSettings((state) => state.showMinimap)
  const setShowMinimap = useSettings((state) => state.setShowMinimap)
  return (
    <div className="dg-chrome absolute bottom-3 left-3 z-10 flex h-8 items-center gap-0.5 px-0.5">
      <Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => void zoomOut({ duration: 160 })}>
        <Minus />
      </Button>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              aria-label={`${Math.round(zoom * 100)}%, reset zoom to 100%`}
              onClick={() => void zoomTo(1, { duration: 200 })}
              className="w-12 px-0 text-xs font-normal tabular-nums"
            />
          }
        >
          {Math.round(zoom * 100)}%
        </TooltipTrigger>
        <TooltipContent>Reset zoom to 100%</TooltipContent>
      </Tooltip>
      <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => void zoomIn({ duration: 160 })}>
        <Plus />
      </Button>
      <Tooltip>
        <TooltipTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="Fit to screen" onClick={fitToScreen} />}
        >
          <Maximize />
        </TooltipTrigger>
        <TooltipContent>
          Fit to screen
          <span className="ml-2 text-muted-foreground">{KEYS.fit}</span>
        </TooltipContent>
      </Tooltip>
      {large && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={showMinimap ? 'secondary' : 'ghost'}
                size="icon-sm"
                aria-label="Minimap"
                aria-pressed={showMinimap}
                className="max-md:hidden"
                onClick={() => setShowMinimap(!showMinimap)}
              />
            }
          >
            <MapIcon />
          </TooltipTrigger>
          <TooltipContent>{showMinimap ? 'Hide the minimap' : 'Show the minimap'}</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
