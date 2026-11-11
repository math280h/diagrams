import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { openDesktopSettings } from './settings-dialog'

const LABEL = 'App settings'

export function DesktopSettingsButton() {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label={LABEL} onClick={openDesktopSettings} />}>
        <Settings />
      </TooltipTrigger>
      <TooltipContent>{LABEL}</TooltipContent>
    </Tooltip>
  )
}
