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
import type { Diagram } from '@/model/schema'
import { crossingText, dataCrossings } from '@/model/threats'
import { fromDiagram } from '@/persistence/serialize'
import { HEADLINE_FEATURES, type HeadlineId, MORE_FEATURES } from './feature-list'

const ACTION_GUIDE_URL = `${REPOSITORY_URL}#keep-diagram-images-up-to-date-with-github-actions`
const SEQUENCE_PREVIEW_MESSAGES = 4
const STEP_PREVIEW_COUNT = 3
const TRACE_PREVIEW_COUNT = 4
const CROSSING_PREVIEW_COUNT = 2
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

function Card({ id, children }: { id: HeadlineId; children?: ReactNode }) {
  const feature = HEADLINE_FEATURES.find((candidate) => candidate.id === id)!
  const Icon = ICONS[id]
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-[15px] font-medium tracking-[-0.01em]">
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <h3>{feature.title}</h3>
      </div>
      <p className="text-[13px] leading-5 text-pretty text-muted-foreground">{feature.summary}</p>
      {children && <div className="mt-auto pt-1">{children}</div>}
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
    return {
      steps: flow.steps
        .map((step) => step.caption)
        .filter(Boolean)
        .slice(0, STEP_PREVIEW_COUNT),
      trace: timed.map((step) => ({ event: step.event, latencyMs: step.latencyMs ?? 0 })),
      crossings: dataCrossings(nodes, edges)
        .filter((crossing) => crossing.boundaries.length > 0)
        .map(crossingText),
      sequence: [lines[0], ...messages.slice(0, SEQUENCE_PREVIEW_MESSAGES), '    …'].join('\n'),
    }
  }, [diagram])
  const slowestMs = Math.max(1, ...(pictures?.trace.map((span) => span.latencyMs) ?? []))

  return (
    <section aria-labelledby="features-heading" className={className}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="features-heading" className="text-xl font-medium tracking-[-0.015em]">
          What Diagrams does
        </h2>
        <span className="text-[13px] text-muted-foreground">
          The pictures come from the template above. Agents and the command line need the desktop app.
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card id="flows">
          {pictures && pictures.steps.length > 0 && (
            <ol aria-label="The first steps of the flow above" className="flex flex-col gap-1.5">
              {pictures.steps.map((caption, index) => (
                <li key={caption} className="flex min-w-0 items-baseline gap-2 text-xs">
                  <span className="w-4 shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <span className="truncate">{caption}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card id="traces">
          {pictures && pictures.trace.length > 0 && (
            <ul aria-label="Operations of the flow above with their latency" className="flex flex-col gap-1.5">
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
          )}
        </Card>
        <Card id="sensitive">
          {pictures && pictures.crossings.length > 0 && (
            <div className="flex flex-col gap-3">
              <ul className="flex flex-col gap-1.5">
                {pictures.crossings.slice(0, CROSSING_PREVIEW_COUNT).map(({ fields, boundaries }) => (
                  <li key={`${fields} ${boundaries}`} className="min-w-0 text-xs">
                    <span className="font-mono text-[11px]">{fields}</span>
                    <span className="text-muted-foreground"> {boundaries}</span>
                  </li>
                ))}
              </ul>
              <Button
                size="sm"
                variant="secondary"
                className="self-start"
                aria-pressed={crossingsShown}
                onClick={() => onCrossingsShownChange(!crossingsShown)}
              >
                {crossingsShown ? 'Hide on the stage' : 'Show on the stage'}
              </Button>
            </div>
          )}
        </Card>
        <Card id="agents">
          <div className="flex flex-col items-start gap-2">
            <span className="rounded-lg border bg-background px-3 py-1.5 text-xs">{EXAMPLE_REQUEST}</span>
            <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground">
              <span aria-hidden className="size-1.5 rounded-full bg-foreground" />
              Agent editing
            </span>
          </div>
        </Card>
        <Card id="share">
          <ul aria-label="Export formats" className="flex flex-wrap gap-1.5">
            {EXPORT_FORMATS.map((format) => (
              <li key={format} className="rounded-md border px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                {format}
              </li>
            ))}
          </ul>
        </Card>
        <Card id="code">
          <div className="flex flex-col gap-3">
            {pictures && (
              <pre
                aria-label="The start of the sequence diagram of the template above"
                className="overflow-hidden rounded-lg border bg-background px-3 py-2 font-mono text-[11px] leading-4 text-muted-foreground [font-variant-ligatures:none]"
              >
                {pictures.sequence}
              </pre>
            )}
            <a
              href={ACTION_GUIDE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[13px] font-medium hover:underline"
            >
              Set up the action <ArrowUpRight className="size-3.5" />
            </a>
          </div>
        </Card>
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
