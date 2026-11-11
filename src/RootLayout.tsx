import { Outlet } from '@tanstack/react-router'
import { ProblemDialog } from '@/components/ProblemDialog'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { isDesktop } from '@/desktop/bridge'
import { ConnectAgentDialog } from '@/desktop/ConnectAgentDialog'
import { DesktopSettingsDialog } from '@/desktop/DesktopSettingsDialog'
import { OpenInAppDialog } from '@/desktop/OpenInAppDialog'
import { FolderAgentDialog } from '@/folder/FolderAgentDialog'
import { useAppChrome } from './use-app-chrome'

export function RootLayout() {
  const theme = useAppChrome()

  return (
    <TooltipProvider delay={350}>
      {isDesktop() && <div className="dg-drag-strip" aria-hidden />}
      <Outlet />
      {isDesktop() ? (
        <>
          <ConnectAgentDialog />
          <DesktopSettingsDialog />
        </>
      ) : (
        <>
          <OpenInAppDialog />
          <FolderAgentDialog />
        </>
      )}
      <ProblemDialog />
      <Toaster theme={theme.base} position="top-center" offset={64} />
    </TooltipProvider>
  )
}
