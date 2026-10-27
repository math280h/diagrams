import { FileUp, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { pickFile } from '@/lib/download'
import { sampleTrace } from '@/import/trace-sample'
import type { ParsedTrace } from './use-parsed-trace'

export function TraceInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const open = async () => {
    const file = await pickFile('application/json,.json')
    if (file) onChange(await file.text())
  }
  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Trace JSON"
        placeholder="Paste a trace as JSON"
        spellCheck={false}
        className="h-48 resize-none font-mono text-xs leading-5"
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={open}>
          <FileUp /> Open a trace file
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onChange(sampleTrace())}>
          <Sparkles /> Use a sample trace
        </Button>
      </div>
    </div>
  )
}

/** Shows what the trace holds, or why it cannot be read. */
export function TraceSummary({ parsed, detail }: { parsed: ParsedTrace; detail: string }) {
  if (parsed.error) {
    return <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{parsed.error}</p>
  }
  if (!parsed.walk) {
    return (
      <p className="text-xs text-muted-foreground">
        Use a trace from OpenTelemetry (OTLP JSON), Jaeger or Zipkin. Each call becomes a step, with its operation,
        latency and status in the log.
      </p>
    )
  }
  const { walk, traceCount } = parsed
  return (
    <p className="text-xs text-muted-foreground">
      {walk.spanCount} {walk.spanCount === 1 ? 'span reaches' : 'spans reach'} {walk.peers.length}{' '}
      {walk.peers.length === 1 ? 'part' : 'parts'} of the system. {detail}
      {traceCount > 1 && ` The file holds ${traceCount} traces; this imports the one with the most spans.`}
    </p>
  )
}
