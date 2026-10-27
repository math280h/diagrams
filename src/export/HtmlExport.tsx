import { Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { downloadBlob } from '@/lib/download'
import { errorMessage } from '@/lib/error-message'
import { safeFileName } from '@/lib/format'
import { currentDiagram } from '@/store/document'
import { useDoc } from '@/store/doc-store'

function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}

export function HtmlExport({ onClose }: { onClose: () => void }) {
  const flowCount = useDoc((state) => state.flows.length)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const diagram = currentDiagram()
      const { exportHtmlPage } = await import('./html-export')
      const blob = await exportHtmlPage(diagram)
      downloadBlob(blob, `${safeFileName(diagram.name)}.html`)
      toast.success(`Saved the page (${megabytes(blob.size)})`)
      onClose()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>
          One HTML file that plays the diagram in any browser, with no other files and no network connection. Put it on
          GitHub Pages, attach it to a pull request, or open it from a shared drive.
        </p>
        <p>
          {flowCount === 0
            ? 'The diagram has no flow, so the page plays the traffic animation.'
            : `Viewers can play, pause and step through ${flowCount === 1 ? 'the flow' : `all ${flowCount} flows`}, and go full screen.`}{' '}
          The page follows the light or dark setting of the viewer.
        </p>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Download />}
          Download .html
        </Button>
      </DialogFooter>
    </>
  )
}
