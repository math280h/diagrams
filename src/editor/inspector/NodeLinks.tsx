import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { nodeTitle } from '@/model/labels'
import { useEngine } from '@/engine/hooks'
import { compileFlow } from '@/engine/flow/compile'
import type { DiagramNode } from '@/model/types'
import { selectOnly } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { setUi } from '@/store/ui-store'
import { stepLine } from '@/editor/flow/names'
import { Section } from './controls'

function title(node: DiagramNode | undefined): string {
  if (!node) return 'Missing node'
  return nodeTitle(node)
}

function Count({ value }: { value: number }) {
  return <span className="text-[11px] text-muted-foreground tabular-nums">{value}</span>
}

function Connections({ node }: { node: DiagramNode }) {
  const nodes = useDoc((state) => state.nodes)
  const edges = useDoc(
    useShallow((state) => state.edges.filter((edge) => edge.source === node.id || edge.target === node.id)),
  )
  if (edges.length === 0) return null
  return (
    <Section title="Connections" action={<Count value={edges.length} />}>
      <ul className="-mx-1">
        {edges.map((edge) => {
          const outgoing = edge.source === node.id
          const otherId = outgoing ? edge.target : edge.source
          return (
            <li key={edge.id}>
              <Button
                variant="ghost"
                onClick={() => selectOnly([otherId])}
                className="h-7 w-full justify-start gap-2 rounded-sm px-1 text-left text-xs font-normal hover:bg-accent"
              >
                {outgoing ? (
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-label="Outgoing" />
                ) : (
                  <ArrowLeft className="size-3.5 shrink-0 text-muted-foreground" aria-label="Incoming" />
                )}
                <span className="min-w-0 flex-1 truncate">{title(nodes.find((other) => other.id === otherId))}</span>
                {edge.data?.label && (
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{edge.data.label}</span>
                )}
              </Button>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

function LogLines({ node }: { node: DiagramNode }) {
  const engine = useEngine()
  const flows = useDoc((state) => state.flows)
  const nodes = useDoc((state) => state.nodes)
  const edges = useDoc((state) => state.edges)
  const nodeIds = new Set(nodes.map((candidate) => candidate.id))
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]))

  const lines = flows.flatMap((flow) =>
    compileFlow(flow, nodeIds, edges)
      .segments.filter(({ step, reversed }) => {
        if (step.target.kind === 'node') return step.target.id === node.id
        const edge = edgeById.get(step.target.id)
        return edge !== undefined && (reversed ? edge.target : edge.source) === node.id
      })
      .map((segment) => ({ flow, segment })),
  )
  if (lines.length === 0) return null

  return (
    <Section title="Log lines" action={<Count value={lines.length} />}>
      <ul className="-mx-1">
        {lines.map(({ flow, segment }) => {
          const { element, event } = stepLine(segment.step, segment.reversed)
          return (
            <li key={`${flow.id}:${segment.step.id}`}>
              <Button
                variant="ghost"
                onClick={() => {
                  setUi({ flowPanelOpen: true, activeFlowId: flow.id, selectedStepId: segment.step.id })
                  selectOnly([])
                  requestAnimationFrame(() => engine.playback.seek(segment.startMs + 1))
                }}
                className="grid h-auto w-full grid-cols-[auto_minmax(0,1fr)] items-baseline justify-items-start gap-x-2 rounded-sm px-1 py-1 text-left text-xs font-normal whitespace-normal hover:bg-accent"
              >
                <span className="font-mono text-muted-foreground tabular-nums">
                  +{(segment.startMs / 1000).toFixed(3)}s
                </span>
                <span className="truncate">{element}</span>
                <span className="col-start-2 flex gap-2 truncate text-[11px] text-muted-foreground">
                  <span className="truncate">{flow.name}</span>
                  {event && <span className="font-mono text-info">{event}</span>}
                </span>
              </Button>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

/** Lists the connections of a node and the flow steps that it starts. */
export function NodeLinks({ node }: { node: DiagramNode }) {
  return (
    <>
      <Connections node={node} />
      <LogLines node={node} />
    </>
  )
}
