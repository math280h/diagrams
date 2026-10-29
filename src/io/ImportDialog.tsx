import { Activity, FileJson, Loader2, Workflow } from 'lucide-react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { pickFile } from '@/lib/download'
import type { Diagram } from '@/model/schema'
import { parseDiagramJson } from '@/persistence/library-actions'
import { errorMessage } from '@/lib/error-message'
import { TraceInput, TraceSummary } from './TraceInput'
import { useParsedTrace } from './use-parsed-trace'

const MERMAID_SAMPLE = `flowchart LR
  user([Shopper]) --> web[Web app]
  web --> gw[API gateway]
  subgraph Services
    gw --> orders[Order service]
    gw --> auth[Auth service]
    orders --> pay{Payment ok?}
  end
  pay -- yes --> db[(Orders DB)]
  pay -. no .-> mail[Email worker]
  orders --> cache[(Redis cache)]`

const NO_DIAGRAM_IN_IMAGE =
  'This image holds no diagram. Export it again with "Keep the diagram in the file" on, or open the JSON file.'

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: (diagram: Diagram) => void
}

export function ImportDialog({ open, onOpenChange, onImported }: ImportDialogProps) {
  const [tab, setTab] = useState<string>('mermaid')
  const [source, setSource] = useState(MERMAID_SAMPLE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [traceSource, setTraceSource] = useState('')
  const parsedTrace = useParsedTrace(traceSource)

  const importFile = async () => {
    setError(null)
    const file = await pickFile('application/json,.json,image/png,.png,image/svg+xml,.svg')
    if (!file) return
    try {
      const image = /\.(png|svg)$/i.test(file.name) || file.type.startsWith('image/')
      if (!image) {
        onImported(parseDiagramJson(await file.text()))
        return
      }
      const { embeddedDiagramText } = await import('@/export/embed')
      const text = await embeddedDiagramText(file)
      if (!text) throw new Error(NO_DIAGRAM_IN_IMAGE)
      onImported(parseDiagramJson(text))
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  const importMermaid = async () => {
    setError(null)
    setBusy(true)
    try {
      const { mermaidToDiagram } = await import('@/import/mermaid')
      const title = /title\s*:?\s*(.+)/i.exec(source)?.[1]?.trim()
      onImported(await mermaidToDiagram(source, title ?? 'Imported flowchart'))
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const importTrace = async () => {
    const { trace } = parsedTrace
    if (!trace) return
    setError(null)
    setBusy(true)
    try {
      const [{ traceToDiagram }, { loadIconSets }, { layoutDiagram }] = await Promise.all([
        import('@/import/trace-apply'),
        import('@/canvas/icons/library'),
        import('@/layout/diagram-layout'),
      ])
      onImported(await traceToDiagram(trace, await loadIconSets().catch(() => []), layoutDiagram))
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const traceDetail = parsedTrace.walk ? 'The new diagram gets a card for each, and the trace as a flow.' : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import a diagram</DialogTitle>
          <DialogDescription>
            Paste a Mermaid flowchart or a trace, or open a diagram file or an image exported from Diagrams.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
          <TabsList>
            <TabsTrigger value="mermaid">
              <Workflow /> Mermaid
            </TabsTrigger>
            <TabsTrigger value="trace">
              <Activity /> Trace
            </TabsTrigger>
            <TabsTrigger value="json">
              <FileJson /> Diagram file
            </TabsTrigger>
          </TabsList>
          <TabsContent value="mermaid" className="mt-3 space-y-2">
            <Textarea
              value={source}
              onChange={(event) => setSource(event.target.value)}
              spellCheck={false}
              className="h-64 resize-none font-mono text-xs leading-5"
            />
            <p className="text-xs text-muted-foreground">
              The import keeps subgraphs, labels, thick lines, dotted lines (as dashed) and decision shapes. It places
              the nodes again with automatic layout.
            </p>
          </TabsContent>
          <TabsContent value="trace" className="mt-3 space-y-2">
            <TraceInput value={traceSource} onChange={setTraceSource} />
            <TraceSummary parsed={parsedTrace} detail={traceDetail} />
          </TabsContent>
          <TabsContent value="json" className="mt-3">
            <Button
              variant="outline"
              onClick={importFile}
              className="h-40 w-full border-dashed font-normal text-muted-foreground hover:bg-accent dark:bg-transparent"
            >
              Choose a .diagram.json file, or a PNG or SVG that holds a diagram
            </Button>
          </TabsContent>
        </Tabs>
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {tab === 'mermaid' && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={importMermaid} disabled={busy || !source.trim()}>
              {busy && <Loader2 className="animate-spin" />}
              Import flowchart
            </Button>
          </DialogFooter>
        )}
        {tab === 'trace' && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={importTrace} disabled={busy || !parsedTrace.trace}>
              {busy && <Loader2 className="animate-spin" />}
              Import trace
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
