import { Copy, Download } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Choice } from '@/editor/inspector/controls'
import { downloadBlob } from '@/lib/download'
import { safeFileName } from '@/lib/format'
import { useDoc } from '@/store/doc-store'
import { diagramToMermaid } from './mermaid'
import { flowToMermaidSequence } from './sequence'

const FLOWCHART = 'flowchart'

export function MermaidExport() {
  const name = useDoc((state) => state.name)
  const nodes = useDoc((state) => state.nodes)
  const edges = useDoc((state) => state.edges)
  const flows = useDoc((state) => state.flows)
  const [chosen, setChosen] = useState(FLOWCHART)
  const flow = flows.find((candidate) => candidate.id === chosen)
  const text = flow ? flowToMermaidSequence(flow, { nodes, edges }) : diagramToMermaid({ nodes, edges })
  const what = flow ? 'Mermaid sequence diagram' : 'Mermaid flowchart'

  const copy = () =>
    void navigator.clipboard.writeText(text).then(
      () => toast.success(`Copied the ${what}`),
      () => toast.error('Could not copy. Select the text and copy it.'),
    )
  const download = () =>
    downloadBlob(new Blob([text], { type: 'text/plain' }), `${safeFileName(flow ? `${name} ${flow.name}` : name)}.mmd`)

  return (
    <>
      <div className="space-y-2">
        {flows.length > 0 && (
          <Choice
            label="Mermaid diagram"
            value={flow ? flow.id : FLOWCHART}
            onChange={setChosen}
            className="w-auto"
            options={[
              { value: FLOWCHART, label: 'Flowchart of the diagram' },
              ...flows.map((candidate) => ({ value: candidate.id, label: `Sequence of “${candidate.name}”` })),
            ]}
          />
        )}
        <Textarea
          readOnly
          value={text}
          aria-label={what}
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
          className="h-72 resize-none font-mono text-xs leading-5 whitespace-pre field-sizing-fixed [font-variant-ligatures:none] md:text-xs"
        />
        <p className="text-xs text-muted-foreground">
          {flow
            ? 'Each call is a solid arrow and each response a dashed one. Steps on a node and captions become notes.'
            : 'Flows, icons, colours and positions stay out. Mermaid lays out the chart again.'}
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
