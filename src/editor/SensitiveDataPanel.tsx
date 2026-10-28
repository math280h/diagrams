import { ShieldAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { nodeTitle } from '@/model/labels'
import { crossingText, SENSITIVE_NAMES, type DataCrossing } from '@/model/threats'
import { selectOnly } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { setUi } from '@/store/ui-store'
import type { DiagramEdge, DiagramNode } from '@/model/types'

function edgeName(edgeId: string, nodes: readonly DiagramNode[], edges: readonly DiagramEdge[]): string {
  const edge = edges.find((candidate) => candidate.id === edgeId)
  const name = (id: string | undefined) => {
    const node = nodes.find((candidate) => candidate.id === id)
    return node ? nodeTitle(node) : 'Missing node'
  }
  return `${name(edge?.source)} → ${name(edge?.target)}`
}

function count(value: number, one: string, many: string) {
  return `${value} ${value === 1 ? one : many}`
}

/** Lists the connections that carry sensitive fields, the ones that cross a trust boundary first. */
export function SensitiveDataPanel({ crossings }: { crossings: readonly DataCrossing[] }) {
  const nodes = useDoc((state) => state.nodes)
  const edges = useDoc((state) => state.edges)
  const crossingCount = crossings.filter((crossing) => crossing.boundaries.length > 0).length
  const ordered = crossings.toSorted(
    (a, b) =>
      Number(b.boundaries.length > 0) - Number(a.boundaries.length > 0) ||
      Number(b.kind === 'secret') - Number(a.kind === 'secret'),
  )
  return (
    <section
      aria-label="Sensitive data"
      className="absolute top-3 left-3 z-10 flex max-h-[calc(100%-5rem)] w-72 flex-col rounded-xl border bg-panel shadow-lg"
    >
      <header className="flex items-center gap-2 border-b py-1.5 pr-1.5 pl-3">
        <ShieldAlert className="size-4 text-warn" aria-hidden />
        <h2 className="text-sm font-medium">Sensitive data</h2>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          aria-label="Hide sensitive data"
          onClick={() => setUi({ sensitiveView: false })}
        >
          <X />
        </Button>
      </header>
      {crossings.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">
          No body field is marked. Select a connection and mark its fields as personal data or a secret.
        </p>
      ) : (
        <>
          <p className="px-3 pt-2 text-xs text-muted-foreground">
            {count(crossings.length, 'connection carries', 'connections carry')} sensitive data.{' '}
            {crossingCount === 0
              ? 'None crosses a trust boundary.'
              : `${count(crossingCount, 'crosses', 'cross')} a trust boundary.`}
          </p>
          <ul className="min-h-0 space-y-0.5 overflow-y-auto p-1.5">
            {ordered.map((crossing) => {
              const text = crossingText(crossing)
              const crosses = crossing.boundaries.length > 0
              return (
                <li key={crossing.edgeId}>
                  <button
                    type="button"
                    data-edge={crossing.edgeId}
                    onClick={() => selectOnly([], [crossing.edgeId])}
                    className="w-full space-y-0.5 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <span className="min-w-0 truncate">{edgeName(crossing.edgeId, nodes, edges)}</span>
                      <span
                        className={cn(
                          'ml-auto shrink-0 rounded px-1 text-[10px] font-normal',
                          crossing.kind === 'secret' ? 'bg-destructive/15 text-destructive' : 'bg-warn/15 text-warn',
                        )}
                      >
                        {SENSITIVE_NAMES[crossing.kind]}
                      </span>
                    </span>
                    <span className="block truncate text-muted-foreground">{text.fields}</span>
                    <span
                      className={cn('flex items-center gap-1', crosses ? 'text-foreground' : 'text-muted-foreground')}
                    >
                      {crosses && <ShieldAlert className="size-3 shrink-0 text-warn" aria-hidden />}
                      {text.boundaries}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
