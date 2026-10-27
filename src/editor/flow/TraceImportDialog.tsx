import { Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { loadIconSets } from '@/canvas/icons/library'
import { addTraceFlow, placeTraceFlow } from '@/import/trace-apply'
import { planTraceFlow, type TraceFlowPlan } from '@/import/trace-flow'
import { TraceInput, TraceSummary } from '@/io/TraceInput'
import { useParsedTrace } from '@/io/use-parsed-trace'
import { layoutDiagram } from '@/layout/diagram-layout'
import { errorMessage } from '@/lib/error-message'
import { useDoc } from '@/store/doc-store'
import { oneStep } from '@/store/history'
import { setUi, useUi } from '@/store/ui-store'

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

function importDetail(plan: TraceFlowPlan, peerCount: number): string {
  const matched =
    plan.matched === peerCount
      ? 'All of them have cards in this diagram.'
      : `${plan.matched} ${plan.matched === 1 ? 'has a card' : 'have cards'} in this diagram.`
  const added = [
    plan.nodes.length > 0 && plural(plan.nodes.length, 'card', 'cards'),
    plan.edges.length > 0 && plural(plan.edges.length, 'connection', 'connections'),
    `a flow with ${plural(plan.flow.steps.length, 'step', 'steps')}`,
  ].filter(Boolean)
  return `${matched} The import adds ${added.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`
}

function TraceImportForm({ onClose }: { onClose: () => void }) {
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const parsed = useParsedTrace(source)
  const nodes = useDoc((state) => state.nodes)
  const edges = useDoc((state) => state.edges)
  const plan = useMemo(
    () => (parsed.walk ? planTraceFlow(parsed.walk, { nodes, edges }, []) : null),
    [parsed.walk, nodes, edges],
  )

  const importTrace = async () => {
    if (!parsed.walk) return
    setBusy(true)
    setError(null)
    try {
      const iconSets = await loadIconSets().catch(() => [])
      const doc = useDoc.getState()
      const placed = await placeTraceFlow(planTraceFlow(parsed.walk, doc, iconSets), doc, layoutDiagram)
      const flowId = oneStep(() => addTraceFlow(placed))
      setUi({
        traceImportOpen: false,
        flowPanelOpen: true,
        flowView: 'steps',
        activeFlowId: flowId,
        selectedStepId: null,
        recording: false,
      })
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const detail = plan && parsed.walk ? importDetail(plan, parsed.walk.peers.length) : ''

  return (
    <>
      <TraceInput value={source} onChange={setSource} />
      <TraceSummary parsed={parsed} detail={detail} />
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={importTrace} disabled={busy || !parsed.walk}>
          {busy && <Loader2 className="animate-spin" />}
          Import trace
        </Button>
      </DialogFooter>
    </>
  )
}

export function TraceImportDialog() {
  const open = useUi((state) => state.traceImportOpen)
  return (
    <Dialog open={open} onOpenChange={(next) => setUi({ traceImportOpen: next })}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import a trace</DialogTitle>
          <DialogDescription>
            Play a real request as a flow. Services, databases and topics use the cards with the same name.
          </DialogDescription>
        </DialogHeader>
        <TraceImportForm onClose={() => setUi({ traceImportOpen: false })} />
      </DialogContent>
    </Dialog>
  )
}
