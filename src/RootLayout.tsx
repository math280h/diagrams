import { Outlet } from '@tanstack/react-router'
import { useNoticeOffsets } from '@/components/notice-space'
import { ProblemDialog } from '@/components/ProblemDialog'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { isDesktop } from '@/desktop/bridge'
import { ConnectAgentDialog } from '@/desktop/ConnectAgentDialog'
import { DesktopSettingsDialog } from '@/desktop/DesktopSettingsDialog'
import { OpenInAppDialog } from '@/desktop/OpenInAppDialog'
import { ShortcutsDialog } from '@/editor/ShortcutsDialog'
import { FolderAgentDialog } from '@/folder/FolderAgentDialog'
import { ReloadQuestion } from '@/new-version/ReloadQuestion'
import { ProblemReportsDialog } from '@/reports/ProblemReportsDialog'
import { ReportDialog } from '@/reports/ReportDialog'
import { useAppChrome } from './use-app-chrome'

export function RootLayout() {
  const theme = useAppChrome()
  const { offset, mobileOffset } = useNoticeOffsets()

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
          <ReloadQuestion />
        </>
      )}
      <ShortcutsDialog />
      <ProblemDialog />
      <ProblemReportsDialog />
      <ReportDialog />
      <Toaster theme={theme.base} position="top-center" offset={offset} mobileOffset={mobileOffset} />
    </TooltipProvider>
  )
}
