import type { ReactElement } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Shows the name of a control and its keys in a tooltip. */
export function ShortcutTooltip({ label, keys, children }: { label: string; keys: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>
        {label}
        <span className="ml-2 text-muted-foreground">{keys}</span>
      </TooltipContent>
    </Tooltip>
  )
}
