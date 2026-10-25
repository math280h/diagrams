import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { desktopApi, isDesktop } from './bridge'
import { useDesktopNavigation } from './chrome'

const IS_MAC = desktopApi()?.platform === 'darwin'
const BACK_KEYS = IS_MAC ? '⌘[' : 'Alt+←'
const FORWARD_KEYS = IS_MAC ? '⌘]' : 'Alt+→'

function NavButton({
  label,
  keys,
  disabled,
  onClick,
  children,
}: {
  label: string
  keys: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={label} disabled={disabled} onClick={onClick} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>
        {label} <span className="ml-1 text-muted-foreground">{keys}</span>
      </TooltipContent>
    </Tooltip>
  )
}

/** Shows back and forward buttons in the desktop app. */
export function TitleBarNav() {
  const { canGoBack, canGoForward } = useDesktopNavigation()
  if (!isDesktop()) return null
  return (
    <div className="flex shrink-0 items-center">
      <NavButton label="Back" keys={BACK_KEYS} disabled={!canGoBack} onClick={() => window.history.back()}>
        <ChevronLeft />
      </NavButton>
      <NavButton label="Forward" keys={FORWARD_KEYS} disabled={!canGoForward} onClick={() => window.history.forward()}>
        <ChevronRight />
      </NavButton>
    </div>
  )
}
