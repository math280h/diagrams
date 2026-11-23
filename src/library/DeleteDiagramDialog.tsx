import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { deleteDiagram } from '@/persistence/library-actions'
import type { DiagramMeta } from '@/persistence/repository'
import { storageCopy } from '@/persistence/storage-copy'

/** Asks before a delete, and asks again for a permanent delete if the trash fails. `null` closes the dialog. */
export function DeleteDiagramDialog({ diagram, onClose }: { diagram: DiagramMeta | null; onClose: () => void }) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [trashFailedId, setTrashFailedId] = useState<string | null>(null)
  const trashFailed = diagram !== null && trashFailedId === diagram.id
  const pending = diagram !== null && pendingId === diagram.id

  const close = () => {
    setTrashFailedId(null)
    onClose()
  }

  const remove = async (target: DiagramMeta, trash: boolean) => {
    setPendingId(target.id)
    const result = await deleteDiagram(target.id, { trash })
    setPendingId(null)
    if (!result.ok && result.reason === 'trash') setTrashFailedId(target.id)
    else close()
  }

  let title = `Delete “${diagram?.name}”?`
  let detail = storageCopy().deleteDetail
  let action = 'Delete diagram'
  if (diagram?.path) {
    title = `Remove “${diagram.name}” from the library?`
    detail = `The file stays where it is: ${diagram.path}`
    action = 'Remove from library'
  } else if (trashFailed) {
    title = `Could not move “${diagram.name}” to the trash`
    detail = 'The diagram file is still in your diagrams folder. You can delete it permanently. You cannot undo this.'
    action = 'Delete permanently'
  }

  return (
    <Dialog open={diagram !== null} onOpenChange={(value) => !value && !pending && close()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{detail}</DialogDescription>
        </DialogHeader>
        <DialogFooter key={trashFailed ? 'trash-failed' : 'confirm'}>
          <Button variant="ghost" autoFocus={trashFailed} disabled={pending} onClick={close}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              if (diagram) void remove(diagram, !trashFailed)
            }}
          >
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
