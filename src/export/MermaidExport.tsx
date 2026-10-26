import { Copy, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { downloadBlob } from '@/lib/download'
import { safeFileName } from '@/lib/format'
import { useDoc } from '@/store/doc-store'
import { diagramToMermaid } from './mermaid'

export function MermaidExport() {
  const name = useDoc((state) => state.name)
  const nodes = useDoc((state) => state.nodes)
  const edges = useDoc((state) => state.edges)
  const text = diagramToMermaid({ nodes, edges })

  const copy = () =>
    void navigator.clipboard.writeText(text).then(
      () => toast.success('Copied the Mermaid flowchart'),
      () => toast.error('Could not copy. Select the text and copy it.'),
    )
  const download = () => downloadBlob(new Blob([text], { type: 'text/plain' }), `${safeFileName(name)}.mmd`)

  return (
    <>
      <div className="space-y-2">
        <Textarea
          readOnly
          value={text}
          aria-label="Mermaid flowchart"
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
          className="h-72 resize-none font-mono text-xs leading-5 whitespace-pre field-sizing-fixed [font-variant-ligatures:none] md:text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Flows, icons, colours and positions stay out. Mermaid lays out the chart again.
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={download}>
          <Download /> Download .mmd
        </Button>
        <Button onClick={copy}>
          <Copy /> Copy
        </Button>
      </DialogFooter>
    </>
  )
}
