import { Check, Loader2, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DesktopDownloadLink } from './DesktopDownloadLink'
import { closeOpenInApp, retryOpenInApp, useHandoff } from './open-in-app'

/** Shows the progress while the website hands a diagram to the desktop app. */
export function OpenInAppDialog() {
  const state = useHandoff()
  return (
    <Dialog open={state.status !== 'idle'} onOpenChange={(open) => !open && closeOpenInApp()}>
      <DialogContent className="sm:max-w-md">
        {state.status === 'opening' && (
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-muted-foreground" /> Opening in Diagrams…
            </DialogTitle>
            <DialogDescription>
              Your browser may ask to open the Diagrams app, and to let this site reach apps on this device. Allow both
              to move “{state.name}” to the app.
            </DialogDescription>
          </DialogHeader>
        )}
        {state.status === 'opened' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="size-4" /> Opened in Diagrams
              </DialogTitle>
              <DialogDescription>
                “{state.name}” is now a file in the app. The copy here stays in this browser.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={closeOpenInApp}>Done</Button>
            </DialogFooter>
          </>
        )}
        {state.status === 'failed' && (
          <>
            <DialogHeader>
              <DialogTitle>Could not open the app</DialogTitle>
              <DialogDescription>
                {state.reason === 'unreachable'
                  ? 'The Diagrams desktop app did not answer. Install it, or allow the browser to open it and to reach apps on this device, then try again.'
                  : state.message}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DesktopDownloadLink variant="ghost" />
              <Button onClick={retryOpenInApp}>
                <RotateCw /> Try again
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
