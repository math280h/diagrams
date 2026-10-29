import { ArrowUpRight, GitPullRequest, Link2, ListOrdered } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { REPOSITORY_URL } from '@/desktop/constants'
import { flowToMermaidSequence } from '@/export/sequence'
import type { Diagram } from '@/model/schema'
import { fromDiagram } from '@/persistence/serialize'

const ACTION_GUIDE_URL = `${REPOSITORY_URL}#keep-diagram-images-up-to-date-with-github-actions`
const SEQUENCE_PREVIEW_MESSAGES = 6

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-[15px] font-medium tracking-[-0.01em]">
        <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
        <h3>{title}</h3>
      </div>
      {children}
    </div>
  )
}

/** Shows how diagrams live next to code: images in pull requests, flows as sequence diagrams, and share links. */
export function DocsAsCode({ diagram, className }: { diagram: Diagram | undefined; className?: string }) {
  const sequence = useMemo(() => {
    const flow = diagram?.flows[0]
    if (!diagram || !flow) return null
    const { nodes, edges } = fromDiagram(diagram)
    const lines = flowToMermaidSequence(flow, { nodes, edges }).split('\n')
    const messages = lines.filter((line) => line.includes('->>'))
    return [lines[0], ...messages.slice(0, SEQUENCE_PREVIEW_MESSAGES), '    …'].join('\n')
  }, [diagram])

  return (
    <section aria-labelledby="docs-as-code-heading" className={className}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="docs-as-code-heading" className="text-xl font-medium tracking-[-0.015em]">
          Keep diagrams with your code
        </h2>
        <span className="text-[13px] text-muted-foreground">
          A diagram is a JSON file you can review, diff and render, with no account and no hosted copy.
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Feature icon={<GitPullRequest />} title="Images in pull requests">
          <p className="text-[13px] leading-5 text-pretty text-muted-foreground">
            A GitHub Action renders each <code className="font-mono text-xs">.diagram.json</code> file to an image, and
            comments the image before and after the change on each pull request.
          </p>
          <a
            href={ACTION_GUIDE_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-auto inline-flex items-center gap-1 text-[13px] font-medium hover:underline"
          >
            Set up the action <ArrowUpRight className="size-3.5" />
          </a>
        </Feature>
        <Feature icon={<ListOrdered />} title="Flows as sequence diagrams">
          <p className="text-[13px] leading-5 text-pretty text-muted-foreground">
            Export a flow as a Mermaid sequence diagram. GitHub draws it in any Markdown file.
          </p>
          {sequence && (
            <pre
              aria-label="The start of the sequence diagram of the template above"
              className="mt-auto overflow-hidden rounded-lg border bg-background px-3 py-2 font-mono text-[11px] leading-4 text-muted-foreground [font-variant-ligatures:none]"
            >
              {sequence}
            </pre>
          )}
        </Feature>
        <Feature icon={<Link2 />} title="Links that carry the diagram">
          <p className="text-[13px] leading-5 text-pretty text-muted-foreground">
            A share link holds the whole diagram after the #, so it opens in any browser and plays its flows. Nothing
            goes to a server.
          </p>
        </Feature>
      </div>
    </section>
  )
}
