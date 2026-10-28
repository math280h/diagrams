import { Copy, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { downloadBlob } from '@/lib/download'
import { safeFileName } from '@/lib/format'
import { descriptionText } from './describe'
import { useDiagramDescription } from './use-description'

export function TextExport() {
  const description = useDiagramDescription()
  const text = descriptionText(description)

  const copy = () =>
    void navigator.clipboard.writeText(text).then(
      () => toast.success('Copied the description'),
      () => toast.error('Could not copy. Select the text and copy it.'),
    )
  const download = () => downloadBlob(new Blob([text], { type: 'text/plain' }), `${safeFileName(description.name)}.txt`)

  return (
    <>
      <div className="space-y-2">
        <Textarea
          readOnly
          value={text}
          aria-label="Text description"
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
          className="h-72 resize-none text-xs leading-5 whitespace-pre-wrap field-sizing-fixed md:text-xs"
        />
        <p className="text-xs text-muted-foreground">
          The boundaries, the parts, the connections and each flow as numbered steps. Screen readers read the same text
          on the canvas.
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={download}>
          <Download /> Download .txt
        </Button>
        <Button onClick={copy}>
          <Copy /> Copy
        </Button>
      </DialogFooter>
    </>
  )
}
