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
import { pickFiles } from '@/lib/download'
import { plural } from '@/lib/format'
import type { Diagram } from '@/model/schema'
import type { ImportedDiagram, ImportReport } from '@/persistence/import-files'
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

const DIAGRAM_FILE_TYPES = 'application/json,.json,image/png,.png,image/svg+xml,.svg,application/zip,.zip'

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Saves and opens a diagram from a Mermaid flowchart or a trace. */
  onImported: (diagram: Diagram) => void
  /** Opens a stored diagram, after the import of one diagram file. */
  onOpen: (id: string) => void
}

async function importFileList(files: readonly File[]): Promise<{ report: ImportReport } | { error: string }> {
  try {
    const { importDiagramFiles } = await import('@/persistence/import-files')
    return { report: await importDiagramFiles(files) }
  } catch (cause) {
    return { error: errorMessage(cause) }
  }
}

function onlyDiagram(report: ImportReport): ImportedDiagram | null {
  const diagrams = [...report.imported, ...report.unchanged]
  return diagrams.length === 1 && report.failed.length === 0 ? diagrams[0]! : null
}

function importedText(importedCount: number, copyCount: number): string {
  if (importedCount === 0) return 'No diagram was imported.'
  const diagrams = `Imported ${plural(importedCount, 'diagram')}`
  if (copyCount === 0) return `${diagrams}.`
  const asCopies = copyCount === 1 ? 'as a copy' : 'as copies'
  return copyCount === importedCount ? `${diagrams} ${asCopies}.` : `${diagrams}, ${copyCount} of them ${asCopies}.`
}

function ImportResult({ report }: { report: ImportReport }) {
  const { imported, copies, unchanged, failed } = report
  return (
    <div role="status" className="mt-3 space-y-1.5 text-sm">
      <p>{importedText(imported.length, copies.length)}</p>
      {unchanged.length > 0 && (
        <p className="text-muted-foreground">
          Skipped {plural(unchanged.length, 'diagram')} that {unchanged.length === 1 ? 'is' : 'are'} already in your
          library.
        </p>
      )}
      {failed.length > 0 && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">
          <p>
            {failed.length === 1 ? '1 file could not be imported:' : `${failed.length} files could not be imported:`}
          </p>
          <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto">
            {failed.map((failure, index) => (
              <li key={index} className="break-words">
                <span className="font-mono text-xs">{failure.file}</span>: {failure.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function ImportDialog({ open, onOpenChange, onImported, onOpen }: ImportDialogProps) {
  const [tab, setTab] = useState<string>('mermaid')
  const [source, setSource] = useState(MERMAID_SAMPLE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [traceSource, setTraceSource] = useState('')
  const parsedTrace = useParsedTrace(traceSource)

  const changeOpen = (next: boolean) => {
    setReport(null)
    setError(null)
    onOpenChange(next)
  }

  const importFiles = async () => {
    const files = await pickFiles(DIAGRAM_FILE_TYPES)
    if (files.length === 0) return
    setError(null)
    setReport(null)
    setBusy(true)
    const outcome = await importFileList(files)
    setBusy(false)
    if ('error' in outcome) {
      setError(outcome.error)
      return
    }
    const result = outcome.report
    const only = onlyDiagram(result)
    if (only) onOpen(only.id)
    else if (files.length === 1 && result.failed.length === 1 && result.imported.length === 0) {
      setError(result.failed[0]!.reason)
    } else setReport(result)
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
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import a diagram</DialogTitle>
          <DialogDescription>
            Paste a Mermaid flowchart or a trace, or open diagram files, a backup or an image exported from Diagrams.
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
              onClick={() => void importFiles()}
              disabled={busy}
              className="h-40 w-full border-dashed font-normal whitespace-normal text-muted-foreground hover:bg-accent dark:bg-transparent"
            >
              {busy && <Loader2 className="animate-spin" />}
              Choose .diagram.json files, a backup .zip file, or a PNG or SVG that holds a diagram
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Import never replaces a diagram in your library. Another version of a diagram that you have comes in as a
              copy.
            </p>
            {report && <ImportResult report={report} />}
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
        {tab === 'json' && report && (
          <DialogFooter>
            <Button onClick={() => changeOpen(false)}>Done</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
