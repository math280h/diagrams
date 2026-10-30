import {
  Activity,
  ArrowUpRight,
  Bot,
  GitPullRequest,
  type LucideIcon,
  Play,
  Plus,
  Share2,
  ShieldAlert,
} from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { REPOSITORY_URL } from '@/desktop/constants'
import { flowToMermaidSequence } from '@/export/sequence'
import { boundaryTitle, nodeTitle } from '@/model/labels'
import type { Diagram, SensitiveKind } from '@/model/schema'
import { crossingText, type DataCrossing, dataCrossings } from '@/model/threats'
import type { DiagramNode } from '@/model/types'
import { cn } from '@/lib/utils'
import { fromDiagram } from '@/persistence/serialize'
import { HEADLINE_FEATURES, type HeadlineId, MORE_FEATURES } from './feature-list'

const ACTION_GUIDE_URL = `${REPOSITORY_URL}#keep-diagram-images-up-to-date-with-github-actions`
const SEQUENCE_PREVIEW_MESSAGES = 4
const STEP_PREVIEW_COUNT = 4
const TRACE_PREVIEW_COUNT = 4
const EXPORT_FORMATS = ['PNG', 'SVG', 'MP4', 'WebM', 'GIF', 'Web page', 'Share link']
const EXAMPLE_REQUEST = '“Draw our checkout with Stripe”'
const MORE_COLUMNS = 3

const ICONS: Record<HeadlineId, LucideIcon> = {
  flows: Play,
  traces: Activity,
  sensitive: ShieldAlert,
  agents: Bot,
  share: Share2,
  code: GitPullRequest,
}

function inColumns<T>(items: readonly T[], count: number): T[][] {
  const size = Math.ceil(items.length / count)
  return Array.from({ length: count }, (_, index) => items.slice(index * size, (index + 1) * size))
}

interface FeaturesProps {
  /** The diagram on the stage above, which the pictures come from. */
  diagram: Diagram | undefined
  crossingsShown: boolean
  onCrossingsShownChange: (shown: boolean) => void
  className?: string
}

interface CrossingSketch {
  source: string
  target: string
  fields: string
  kind: SensitiveKind
  boundary: string
  /** The end of the connection that is inside the boundary. */
  inside: 'source' | 'target'
  text: { fields: string; boundaries: string }
}

function isWithin(node: DiagramNode | undefined, boundary: string, byId: ReadonlyMap<string, DiagramNode>): boolean {
  for (let parent = byId.get(node?.parentId ?? ''); parent; parent = byId.get(parent.parentId ?? '')) {
    if (parent.type === 'group' && boundaryTitle(parent) === boundary) return true
  }
  return false
}

function crossingSketch(
  crossing: DataCrossing,
  nodes: readonly DiagramNode[],
  edges: readonly { id: string; source: string; target: string }[],
): CrossingSketch | null {
  const edge = edges.find((candidate) => candidate.id === crossing.edgeId)
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const source = byId.get(edge?.source ?? '')
  const target = byId.get(edge?.target ?? '')
  const boundary = crossing.boundaries[0]
  if (!source || !target || !boundary) return null
  return {
    source: nodeTitle(source),
    target: nodeTitle(target),
    fields: crossing.fields.map((field) => field.path).join(', '),
    kind: crossing.kind,
    boundary,
    inside: isWithin(target, boundary, byId) && !isWithin(source, boundary, byId) ? 'target' : 'source',
    text: crossingText(crossing),
  }
}

function SketchNode({ name, pending = false }: { name: string; pending?: boolean }) {
  return (
    <span
      className={cn(
        'max-w-24 shrink-0 truncate rounded-md border px-2.5 py-1.5 text-xs font-medium',
        pending ? 'border-dashed border-foreground/40 text-muted-foreground' : 'bg-card',
      )}
    >
      {name}
    </span>
  )
}

function SketchArrow() {
  return (
    <span className="flex min-w-4 flex-1 items-center text-muted-foreground">
      <span className="h-px flex-1 bg-current" />
      <span className="size-1.5 shrink-0 bg-current [clip-path:polygon(0_0,100%_50%,0_100%)]" />
    </span>
  )
}

function CrossingPicture({ sketch }: { sketch: CrossingSketch }) {
  const color = sketch.kind === 'secret' ? 'bg-destructive' : 'bg-warn'
  const segment = <span className={cn('h-0.5 min-w-5 flex-1', color)} />
  const arrow = <span className={cn('size-2 shrink-0 [clip-path:polygon(0_0,100%_50%,0_100%)]', color)} />
  const boundary = (children: ReactNode) => (
    <div
      className={cn(
        'relative flex min-w-0 flex-1 items-center rounded-lg border border-dashed border-foreground/30 py-4',
        sketch.inside === 'source' ? 'pl-3' : 'pr-3',
      )}
    >
      <span className="absolute -top-2 left-2 max-w-40 truncate bg-background px-1 text-[11px] leading-4 text-muted-foreground">
        {sketch.boundary}
      </span>
      {children}
    </div>
  )
  return (
    <figure className="flex flex-col gap-3">
      <div aria-hidden className="flex items-center pt-2">
        {sketch.inside === 'source' ? (
          boundary(
            <>
              <SketchNode name={sketch.source} />
              {segment}
            </>,
          )
        ) : (
          <SketchNode name={sketch.source} />
        )}
        <span className="relative flex min-w-16 flex-1 items-center">
          <span className={cn('h-0.5 flex-1', color)} />
          {sketch.inside === 'source' && arrow}
          <span
            className={cn(
              'absolute -top-6 left-1/2 max-w-full -translate-x-1/2 truncate rounded-[3px] px-1 font-mono text-[11px] leading-4 text-background',
              color,
            )}
          >
            {sketch.fields}
          </span>
        </span>
        {sketch.inside === 'target' ? (
          boundary(
            <>
              {segment}
              {arrow}
              <SketchNode name={sketch.target} />
            </>,
          )
        ) : (
          <SketchNode name={sketch.target} />
        )}
      </div>
      <figcaption className="text-xs leading-[18px] text-pretty">
        <span className="font-mono text-[11px]">{sketch.text.fields}</span>
        <span className="text-muted-foreground"> {sketch.text.boundaries}</span>
      </figcaption>
    </figure>
  )
}

function Card({ id, picture, action }: { id: HeadlineId; picture: ReactNode; action?: ReactNode }) {
  const feature = HEADLINE_FEATURES.find((candidate) => candidate.id === id)!
  const Icon = ICONS[id]
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex h-36 flex-col justify-center overflow-hidden border-b bg-background px-5">{picture}</div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2 text-[15px] font-medium tracking-[-0.01em]">
          <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <h3>{feature.title}</h3>
        </div>
        <p className="text-[13px] leading-5 text-pretty text-muted-foreground">{feature.summary}</p>
        {action && <div className="mt-auto pt-2">{action}</div>}
      </div>
    </div>
  )
}

/** Shows what Diagrams does: the headline features with pictures from the diagram on the stage, then every other one. */
export function Features({ diagram, crossingsShown, onCrossingsShownChange, className }: FeaturesProps) {
  const pictures = useMemo(() => {
    const flow = diagram?.flows[0]
    if (!diagram || !flow) return null
    const { nodes, edges } = fromDiagram(diagram)
    const lines = flowToMermaidSequence(flow, { nodes, edges }).split('\n')
    const messages = lines.filter((line) => line.includes('->>'))
    const timed = flow.steps.filter((step) => step.event && step.latencyMs !== null).slice(0, TRACE_PREVIEW_COUNT)
    const crossing = dataCrossings(nodes, edges).find((candidate) => candidate.boundaries.length > 0)
    return {
      steps: flow.steps
        .map((step, index) => ({ number: index + 1, caption: step.caption }))
        .filter((step) => step.caption)
        .slice(0, STEP_PREVIEW_COUNT),
      stepCount: flow.steps.length,
      trace: timed.map((step) => ({ event: step.event, latencyMs: step.latencyMs ?? 0 })),
      crossing: crossing ? crossingSketch(crossing, nodes, edges) : null,
      sequence: [lines[0], ...messages.slice(0, SEQUENCE_PREVIEW_MESSAGES), '    …'].join('\n'),
    }
  }, [diagram])
  const slowestMs = Math.max(1, ...(pictures?.trace.map((span) => span.latencyMs) ?? []))

  return (
    <section aria-labelledby="features-heading" className={className}>
      <div className="mb-8 max-w-2xl">
        <h2 id="features-heading" className="dg-display text-3xl leading-[1.1] sm:text-4xl">
          What Diagrams does
        </h2>
        <p className="mt-3 text-base leading-6 text-pretty text-muted-foreground">
          The pictures come from the template above. Agents and the command line need the desktop app.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card
          id="flows"
          picture={
            pictures &&
            pictures.steps.length > 0 && (
              <ol aria-label="The first steps of the flow above" className="flex flex-col gap-2">
                {pictures.steps.map(({ number, caption }, index) => (
                  <li key={number} className="flex min-w-0 items-baseline gap-2.5 text-[13px] leading-[18px]">
                    <span
                      className={cn(
                        'shrink-0 rounded-[4px] px-1.5 font-mono text-[11px] tabular-nums',
                        index === 0 ? 'bg-flow text-flow-ink' : 'text-muted-foreground ring-1 ring-border ring-inset',
                      )}
                    >
                      {number}/{pictures.stepCount}
                    </span>
                    <span className={cn('truncate', index > 0 && 'text-muted-foreground')}>{caption}</span>
                  </li>
                ))}
              </ol>
            )
          }
        />
        <Card
          id="traces"
          picture={
            pictures &&
            pictures.trace.length > 0 && (
              <ul aria-label="Operations of the flow above with their latency" className="flex flex-col gap-2">
                {pictures.trace.map((span) => (
                  <li key={span.event} className="grid grid-cols-[minmax(0,1fr)_5rem_3rem] items-center gap-2">
                    <span className="truncate font-mono text-[11px]">{span.event}</span>
                    <span className="h-1.5 rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-flow"
                        style={{ width: `${Math.max(6, (span.latencyMs / slowestMs) * 100)}%` }}
                      />
                    </span>
                    <span className="text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                      {span.latencyMs} ms
                    </span>
                  </li>
                ))}
              </ul>
            )
          }
        />
        <Card
          id="sensitive"
          picture={pictures?.crossing && <CrossingPicture sketch={pictures.crossing} />}
          action={
            pictures?.crossing && (
              <Button
                size="sm"
                variant="secondary"
                aria-pressed={crossingsShown}
                onClick={() => onCrossingsShownChange(!crossingsShown)}
              >
                {crossingsShown ? 'Hide on the stage' : 'Show on the stage'}
              </Button>
            )
          }
        />
        <Card
          id="agents"
          picture={
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-lg border bg-card px-3 py-1.5 text-xs">{EXAMPLE_REQUEST}</span>
                <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground">
                  <span aria-hidden className="size-1.5 rounded-full bg-foreground" />
                  Agent editing
                </span>
              </div>
              <div aria-hidden className="flex items-center">
                <SketchNode name="Browser" />
                <SketchArrow />
                <SketchNode name="Checkout" />
                <SketchArrow />
                <SketchNode name="Stripe" pending />
              </div>
            </div>
          }
        />
        <Card
          id="share"
          picture={
            <ul aria-label="Export formats" className="flex flex-wrap gap-1.5">
              {EXPORT_FORMATS.map((format) => (
                <li
                  key={format}
                  className="rounded-md border bg-card px-2.5 py-1 font-mono text-xs text-muted-foreground"
                >
                  {format}
                </li>
              ))}
            </ul>
          }
        />
        <Card
          id="code"
          picture={
            pictures && (
              <pre
                aria-label="The start of the sequence diagram of the template above"
                className="overflow-hidden font-mono text-[11px] leading-4 text-muted-foreground [font-variant-ligatures:none]"
              >
                {pictures.sequence}
              </pre>
            )
          }
          action={
            <a
              href={ACTION_GUIDE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[13px] font-medium hover:underline"
            >
              Set up the action <ArrowUpRight className="size-3.5" />
            </a>
          }
        />
      </div>
      <div className="mt-12 grid gap-x-8 gap-y-3 border-t pt-8 md:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
        <h3 className="text-[13px] text-muted-foreground">Also in Diagrams</h3>
        <div className="grid sm:grid-cols-3 sm:gap-x-6">
          {inColumns(MORE_FEATURES, MORE_COLUMNS).map((column, index) => (
            <ul key={column[0]?.title} className={index > 0 ? 'sm:border-l sm:pl-6' : undefined}>
              {column.map(({ title, summary }) => (
                <li key={title}>
                  <Collapsible>
                    <CollapsibleTrigger className="group flex items-center gap-1.5 py-1.5 text-left text-[15px] text-foreground/80 transition-colors hover:text-foreground data-[panel-open]:text-foreground motion-reduce:transition-none">
                      {title}
                      <Plus
                        aria-hidden
                        className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-45 motion-reduce:transition-none"
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pb-2 text-[13px] leading-5 text-pretty text-muted-foreground">
                      {summary}
                    </CollapsibleContent>
                  </Collapsible>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  )
}
