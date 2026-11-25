import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { exportDiagramJson } from '@/persistence/library-actions'
import { currentDiagram, discardUnsavedChanges } from '@/store/document'
import { reloadForNewVersion, useReloadQuestion } from './new-version'

const UNSAVED =
  'Your last changes are not saved. If you reload now, you lose them. To keep them, export the diagram file first.'
const SAVED = 'Your diagrams are saved.'

function close() {
  useReloadQuestion.setState({ question: null })
}

/** Asks before a reload for a new version stops work, such as an export or text in a dialog. */
export function ReloadQuestion() {
  const question = useReloadQuestion((state) => state.question)
  const unsaved = question?.unsaved ?? false
  const text = question ? [...(unsaved ? [UNSAVED] : []), ...question.stops, ...(unsaved ? [] : [SAVED])] : []

  return (
    <Dialog open={question !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md" showCloseButton={false} data-reload-question>
        <DialogHeader>
          <DialogTitle>Reload now?</DialogTitle>
          <DialogDescription>{text.join(' ')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {unsaved && (
            <Button
              variant="destructive"
              className="sm:mr-auto"
              onClick={() => {
                discardUnsavedChanges()
                void reloadForNewVersion()
              }}
            >
              Reload without saving
            </Button>
          )}
          <Button variant="ghost" onClick={close}>
            Stay
          </Button>
          {unsaved ? (
            <Button onClick={() => exportDiagramJson(currentDiagram())}>Export diagram file</Button>
          ) : (
            <Button onClick={() => void reloadForNewVersion()}>Reload</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
