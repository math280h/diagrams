import { Outlet } from '@tanstack/react-router'
import { ProblemDialog } from '@/components/ProblemDialog'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { isDesktop } from '@/desktop/bridge'
import { ConnectAgentDialog } from '@/desktop/ConnectAgentDialog'
import { OpenInAppDialog } from '@/desktop/OpenInAppDialog'
import { useAppChrome } from './use-app-chrome'

export function RootLayout() {
  const theme = useAppChrome()

  return (
    <TooltipProvider delay={350}>
      {isDesktop() && <div className="dg-drag-strip" aria-hidden />}
      <Outlet />
      {isDesktop() ? <ConnectAgentDialog /> : <OpenInAppDialog />}
      <ProblemDialog />
      <Toaster theme={theme} position="top-center" offset={64} />
    </TooltipProvider>
  )
}
