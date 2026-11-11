import { MoreDetails } from '@/components/MoreDetails'
import { ProblemDialog } from '@/components/ProblemDialog'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { isDesktop } from '@/desktop/bridge'
import { errorProblem } from '@/lib/problem-report'
import { showProblem } from '@/store/problem-store'
import { useAppChrome } from './use-app-chrome'

/** Shows why the app could not load its diagrams, in place of the app. */
export function StartupError({ message }: { message: string }) {
  const theme = useAppChrome()
  const desktop = isDesktop()
  const title = desktop ? 'The app could not open your diagrams folder' : 'The app could not load your diagrams'
  return (
    <>
      {desktop && <div className="dg-drag-strip" aria-hidden />}
      <div role="alert" className="grid h-full place-items-center p-6">
        <div className="max-w-md text-center">
          <p className="text-base font-medium">{title}</p>
          <p className="mt-1 font-mono text-xs break-words text-muted-foreground">{message}</p>
          <MoreDetails
            onClick={() =>
              showProblem(errorProblem(title, message, [`Storage: ${desktop ? 'diagrams folder' : 'browser storage'}`]))
            }
          />
          <p className="mt-3 text-sm text-pretty text-muted-foreground">
            {desktop
              ? 'Check that the folder exists and that this app may read and write it. Security settings such as Windows controlled folder access can block it.'
              : 'Check that this browser allows site storage, then try again.'}
          </p>
          <Button className="mt-5" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </div>
      <ProblemDialog />
      <Toaster theme={theme.base} position="top-center" />
    </>
  )
}
