import { useBlocker, type ShouldBlockFn } from '@tanstack/react-router'
import { CloudAlert } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { isDesktop } from '@/desktop/bridge'
import { exportDiagramJson } from '@/persistence/library-actions'
import { storageCopy } from '@/persistence/storage-copy'
import { currentDiagram, discardUnsavedChanges, flushPendingSave, saveAndSettle } from '@/store/document'
import { useUnsaved, type UnsavedDiagram } from '@/store/unsaved'

function failureText(diagram: UnsavedDiagram) {
  return diagram.reason === 'quota' ? 'Browser storage is full.' : storageCopy().saveFailed
}

const exportCurrent = () => exportDiagramJson(currentDiagram())

/** Shows in the top bar while the last changes of the open diagram are not in storage. */
export function UnsavedMark() {
  const unsaved = useUnsaved((state) => state.diagram)
  if (!unsaved) return null
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger render={<Button variant="destructive" aria-label="Not saved" className="max-sm:px-2" />} />
          }
        >
          <CloudAlert /> <span className="hidden sm:inline">Not saved</span>
        </TooltipTrigger>
        <TooltipContent>Your last changes are not saved</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 gap-3 p-3">
        <PopoverHeader>
          <PopoverTitle>Your last changes are not saved</PopoverTitle>
          <PopoverDescription>
            {failureText(unsaved)} The app tries again. To keep your changes, export the diagram file.
          </PopoverDescription>
        </PopoverHeader>
        <p className="font-mono text-xs break-words text-muted-foreground">{unsaved.message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={flushPendingSave}>
            Try again
          </Button>
          <Button size="sm" onClick={exportCurrent}>
            Export diagram file
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

const leaveNeedsAnswer: ShouldBlockFn = async ({ current, next }) => {
  if (next.pathname === current.pathname) return false
  return (await saveAndSettle()) !== null
}

const unloadNeedsAnswer = () => {
  if (isDesktop()) return false
  flushPendingSave()
  return useUnsaved.getState().diagram !== null
}

/**
 * Asks before the user leaves the editor while the last changes are not in storage. A save that reaches storage
 * while the question shows lets the user leave.
 */
export function UnsavedLeaveGuard() {
  const blocker = useBlocker({
    shouldBlockFn: leaveNeedsAnswer,
    enableBeforeUnload: unloadNeedsAnswer,
    withResolver: true,
  })
  const unsaved = useUnsaved((state) => state.diagram)
  const blocked = blocker.status === 'blocked'

  useEffect(() => {
    if (blocked && !unsaved) blocker.proceed?.()
  }, [blocked, unsaved, blocker])

  return (
    <Dialog open={blocked} onOpenChange={(open) => !open && blocker.reset?.()}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Leave without saving?</DialogTitle>
          <DialogDescription>
            {unsaved && failureText(unsaved)} If you leave now, you lose the changes since the last save. To keep them,
            export the diagram file first.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="destructive"
            className="sm:mr-auto"
            onClick={() => {
              discardUnsavedChanges()
              blocker.proceed?.()
            }}
          >
            Leave without saving
          </Button>
          <Button variant="ghost" onClick={() => blocker.reset?.()}>
            Stay
          </Button>
          <Button onClick={exportCurrent}>Export diagram file</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
