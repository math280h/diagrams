import { ReactFlowProvider, useNodesInitialized, useReactFlow, type Viewport } from '@xyflow/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DiagramCanvas } from '@/canvas/DiagramCanvas'
import { useLocalNodes } from '@/canvas/use-local-nodes'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EngineProvider } from '@/engine/context'
import { useReducedMotion } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { describeChange } from '@/model/diagram-diff'
import type { MergeConflict, MergeOrigin, MergeResult, MergeSide } from '@/model/diagram-merge'
import { fromDiagram } from '@/persistence/serialize'
import { storageCopy } from '@/persistence/storage-copy'
import {
  applyOutsideReview,
  cancelOutsideReview,
  chooseMergeSide,
  keepOpenVersion,
  loadNewerVersion,
} from '@/store/document'
import { reviewChosen, useOutsideReview, type OutsideReview } from '@/store/outside-review'
import { useActiveTheme } from '@/themes/active'
import { editorFit } from '../fit'
import { Segmented } from '../inspector/controls'
import { conflictDetail, conflictRect, conflictTitle } from './merge-words'

const ZOOM_DURATION_MS = 300

const MARKS: Record<MergeOrigin, string> = {
  theirs: 'dg-merge-theirs',
  both: 'dg-merge-theirs',
  mine: 'dg-merge-mine',
  conflict: 'dg-merge-conflict',
}

function markedElements(result: MergeResult) {
  const { nodes, edges } = fromDiagram(result.diagram)
  const mark = (key: string) => {
    const origin = result.origins.get(key)
    return origin ? MARKS[origin] : undefined
  }
  return {
    nodes: nodes.map((node) => ({ ...node, className: mark(`node:${node.id}`) })),
    edges: edges.map((edge) => ({ ...edge, className: mark(`edge:${edge.id}`) })),
  }
}

function MergeCanvas({ result, viewport }: { result: MergeResult; viewport: Viewport }) {
  const marked = useMemo(() => markedElements(result), [result])
  const [nodes, onNodesChange] = useLocalNodes(marked.nodes)
  const colorTheme = useActiveTheme()
  const { fitView } = useReactFlow()
  const measured = useNodesInitialized()
  const fitted = useRef(false)
  useEffect(() => {
    if (!measured || fitted.current) return
    fitted.current = true
    void fitView(editorFit())
  }, [measured, fitView])
  return (
    <DiagramCanvas
      nodes={nodes}
      edges={marked.edges}
      theme={result.diagram.theme}
      colorTheme={colorTheme}
      editable={false}
      showCaption={false}
      defaultViewport={viewport}
      onNodesChange={onNodesChange}
      nodesFocusable={false}
      edgesFocusable={false}
    />
  )
}

function Legend({ fromOutside }: { fromOutside: string }) {
  const items = [
    { label: `Changed ${fromOutside}`, className: 'border-dashed border-foreground' },
    { label: 'Changed here', className: 'border-solid border-foreground' },
    { label: 'Needs a choice', className: 'border-solid border-destructive' },
  ]
  return (
    <ul aria-label="Marks on the canvas" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden className={cn('size-3 rounded-[3px] border-2', item.className)} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

function ConflictRow({
  review,
  conflict,
  onChoose,
}: {
  review: OutsideReview
  conflict: MergeConflict
  onChoose: (conflict: MergeConflict, side: MergeSide) => void
}) {
  const copy = storageCopy()
  const title = conflictTitle(review, conflict)
  return (
    <li className="space-y-1.5 rounded-lg border px-2.5 py-2">
      <p className="font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{conflictDetail(review, conflict, copy.fromOutside)}</p>
      <Segmented
        label={`Choice for ${title}`}
        value={review.choices.get(conflict.key) ?? null}
        options={[
          { value: 'mine', label: 'Keep mine' },
          { value: 'theirs', label: `Use ${copy.outsideVersion}` },
        ]}
        onChange={(side) => onChoose(conflict, side)}
      />
    </li>
  )
}

function MergePanel({ review }: { review: OutsideReview }) {
  const copy = storageCopy()
  const { fitBounds } = useReactFlow()
  const reducedMotion = useReducedMotion()
  const { conflicts, droppedEdges, detachedNodes } = review.result
  const keys = conflicts.map((conflict) => conflict.key)
  const theirChanges = useMemo(() => describeChange(review.base, review.theirs), [review.base, review.theirs])
  const myChanges = useMemo(() => describeChange(review.base, review.mine), [review.base, review.mine])
  const choose = (conflict: MergeConflict, side: MergeSide) => {
    chooseMergeSide([conflict.key], side)
    const rect = conflictRect(review, conflict)
    if (rect) void fitBounds(rect, { padding: 0.6, duration: reducedMotion ? 0 : ZOOM_DURATION_MS })
  }

  return (
    <aside
      aria-label="Review the changes"
      className="flex shrink-0 flex-col border-l bg-panel max-md:h-[45%] max-md:border-t max-md:border-l-0 md:w-80"
    >
      <header className="flex h-10 shrink-0 items-center border-b px-3">
        <h2 className="text-[13px] font-medium">Review the changes</h2>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-3 text-[13px]">
          <Legend fromOutside={copy.fromOutside} />
          {conflicts.length > 0 && (
            <section aria-labelledby="merge-conflicts" className="space-y-2">
              <h3 id="merge-conflicts" className="text-xs text-muted-foreground">
                {conflicts.length === 1 ? '1 change needs a choice' : `${conflicts.length} changes need a choice`}
              </h3>
              {conflicts.length > 1 && (
                <div className="grid grid-cols-2 gap-1.5">
                  <Button size="xs" variant="outline" onClick={() => chooseMergeSide(keys, 'mine')}>
                    All mine
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => chooseMergeSide(keys, 'theirs')}>
                    All {copy.fromOutside}
                  </Button>
                </div>
              )}
              <ul className="space-y-2">
                {conflicts.map((conflict) => (
                  <ConflictRow key={conflict.key} review={review} conflict={conflict} onChoose={choose} />
                ))}
              </ul>
            </section>
          )}
          <section className="space-y-1">
            <h3 className="text-xs text-muted-foreground first-letter:uppercase">{copy.fromOutside}</h3>
            <p>{theirChanges}</p>
          </section>
          <section className="space-y-1">
            <h3 className="text-xs text-muted-foreground">Here</h3>
            <p>{myChanges}</p>
          </section>
          {droppedEdges.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {droppedEdges.length === 1
                ? 'The merge leaves out 1 connection, because one of its nodes is deleted.'
                : `The merge leaves out ${droppedEdges.length} connections, because one of their nodes is deleted.`}
            </p>
          )}
          {detachedNodes.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {detachedNodes.length === 1
                ? 'The merge takes 1 node out of a deleted boundary.'
                : `The merge takes ${detachedNodes.length} nodes out of a deleted boundary.`}
            </p>
          )}
        </div>
      </ScrollArea>
      <footer className="grid shrink-0 grid-cols-2 gap-1.5 border-t p-3">
        <Button size="sm" variant="outline" onClick={keepOpenVersion}>
          Keep this version
        </Button>
        <Button size="sm" variant="outline" onClick={loadNewerVersion}>
          Load newer
        </Button>
        <Button size="sm" variant="ghost" onClick={cancelOutsideReview}>
          Cancel
        </Button>
        <Button size="sm" disabled={!reviewChosen(review)} onClick={applyOutsideReview}>
          Apply
        </Button>
      </footer>
    </aside>
  )
}

/**
 * Covers the editor canvas with the merge of the open diagram and a version from outside, and lets the user choose a
 * side for each conflict.
 */
export function MergeReview() {
  const { getViewport } = useReactFlow()
  const [viewport] = useState(getViewport)
  const review = useOutsideReview((state) => state.review)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelOutsideReview()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!review) return null
  return (
    <div className="absolute inset-0 z-[5] flex bg-background max-md:flex-col" data-merge-review>
      <ReactFlowProvider>
        <div className="relative min-h-0 min-w-0 flex-1">
          <EngineProvider>
            <MergeCanvas result={review.result} viewport={viewport} />
          </EngineProvider>
        </div>
        <MergePanel review={review} />
      </ReactFlowProvider>
    </div>
  )
}
