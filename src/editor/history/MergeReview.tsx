import { ReactFlowProvider, useNodesInitialized, useReactFlow } from '@xyflow/react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { canvasThemeAttributes, swatchColor } from '@/canvas/canvas-theme'
import { DiagramCanvas } from '@/canvas/DiagramCanvas'
import { useLocalNodes } from '@/canvas/use-local-nodes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EngineProvider } from '@/engine/context'
import { useReducedMotion } from '@/lib/motion'
import { useWindowSize } from '@/lib/use-window-size'
import { cn } from '@/lib/utils'
import type { Color } from '@/model/colors'
import { describeChange } from '@/model/diagram-diff'
import { changedElements, type MergeChoiceKind, type MergeConflict } from '@/model/diagram-merge'
import type { Diagram } from '@/model/schema'
import { fromDiagram } from '@/persistence/serialize'
import { storageCopy } from '@/persistence/storage-copy'
import {
  applyOutsideReview,
  cancelOutsideReview,
  chooseMerge,
  keepOpenVersion,
  loadNewerVersion,
} from '@/store/document'
import { reviewChosen, useOutsideReview, type OutsideReview } from '@/store/outside-review'
import { useActiveTheme } from '@/themes/active'
import { editorFit, NARROW_SCREEN_PX } from '../fit'
import { Segmented } from '../inspector/controls'
import { conflictElement, conflictElementKey, conflictRect, resultText, valueView, type ValueView } from './merge-words'

const PAN_DURATION_MS = 300
const FOCUS_MIN_ZOOM = 0.75

type Marks = ReadonlyMap<string, string>

function changedMarks(changed: ReadonlySet<string>): Marks {
  return new Map([...changed].map((key) => [key, 'dg-merge-changed']))
}

function resultMarks(review: OutsideReview): Marks {
  const marks = new Map<string, string>()
  for (const conflict of review.result.conflicts) {
    const key = conflictElementKey(conflict)
    if (!key) continue
    const open = !review.choices.has(conflict.key)
    if (open || !marks.has(key)) marks.set(key, open ? 'dg-merge-open' : 'dg-merge-done')
  }
  return marks
}

function withSelection(marks: Marks, selected: string | null): Marks {
  if (!selected) return marks
  const next = new Map(marks)
  next.set(selected, cn(marks.get(selected), 'dg-merge-selected'))
  return next
}

function markedElements(diagram: Diagram, marks: Marks) {
  const { nodes, edges } = fromDiagram(diagram)
  return {
    nodes: nodes.map((node) => ({ ...node, className: marks.get(`node:${node.id}`) })),
    edges: edges.map((edge) => ({ ...edge, className: marks.get(`edge:${edge.id}`) })),
  }
}

function PaneCanvas({
  diagram,
  marks,
  focus,
  onSelectElement,
}: {
  diagram: Diagram
  marks: Marks
  focus: MergeConflict | null
  onSelectElement: (key: string) => void
}) {
  const elements = useMemo(() => markedElements(diagram, marks), [diagram, marks])
  const [nodes, onNodesChange] = useLocalNodes(elements.nodes)
  const colorTheme = useActiveTheme()
  const { fitView, setCenter, getZoom } = useReactFlow()
  const measured = useNodesInitialized()
  const reducedMotion = useReducedMotion()
  const rect = focus ? conflictRect(diagram, focus) : null
  const focusX = rect ? rect.x + rect.width / 2 : null
  const focusY = rect ? rect.y + rect.height / 2 : null
  const placed = useRef(false)
  useEffect(() => {
    if (!measured) return
    const first = !placed.current
    placed.current = true
    if (focusX === null || focusY === null) {
      if (first) void fitView(editorFit())
      return
    }
    void setCenter(focusX, focusY, {
      zoom: Math.max(getZoom(), FOCUS_MIN_ZOOM),
      duration: first || reducedMotion ? 0 : PAN_DURATION_MS,
    })
  }, [measured, focusX, focusY, fitView, setCenter, getZoom, reducedMotion])

  return (
    <DiagramCanvas
      nodes={nodes}
      edges={elements.edges}
      theme={diagram.theme}
      colorTheme={colorTheme}
      editable={false}
      showCaption={false}
      onNodesChange={onNodesChange}
      onNodeClick={(_, node) => onSelectElement(`node:${node.id}`)}
      onEdgeClick={(_, edge) => onSelectElement(`edge:${edge.id}`)}
      nodesFocusable={false}
      edgesFocusable={false}
    />
  )
}

function MergePane({
  label,
  className,
  ...canvas
}: {
  label: string
  className?: string
  diagram: Diagram
  marks: Marks
  focus: MergeConflict | null
  onSelectElement: (key: string) => void
}) {
  return (
    <section aria-label={label} className={cn('relative min-h-0 min-w-0 bg-background', className)}>
      <ReactFlowProvider>
        <EngineProvider>
          <PaneCanvas {...canvas} />
        </EngineProvider>
      </ReactFlowProvider>
      <p className="dg-chrome pointer-events-none absolute top-2 left-2 z-10 px-2 py-0.5 text-xs font-medium">
        {label}
      </p>
    </section>
  )
}

function Swatch({ color }: { color: Color }) {
  const theme = useActiveTheme()
  return (
    <span {...canvasThemeAttributes(theme)} className="dg-zones inline-flex shrink-0">
      <span aria-hidden className="size-3 rounded-full" style={{ background: swatchColor(color) }} />
    </span>
  )
}

function ValueCell({ term, view }: { term: string; view: ValueView }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{term}</dt>
      <dd
        title={view.text}
        className={cn('mt-0.5 flex min-w-0 items-center gap-1.5', view.kind === 'empty' && 'text-muted-foreground')}
      >
        {view.kind === 'color' && <Swatch color={view.color} />}
        <span className="line-clamp-3 break-words">{view.text}</span>
      </dd>
    </div>
  )
}

function choiceOptions(conflict: MergeConflict, outsideChoice: string) {
  if (conflict.deletedBy) {
    const keeper: MergeChoiceKind = conflict.deletedBy === 'mine' ? 'theirs' : 'mine'
    return [
      { value: keeper, label: 'Keep it' },
      { value: conflict.deletedBy, label: 'Delete it' },
    ]
  }
  const labels: Record<MergeChoiceKind, string> = { mine: 'Yours', theirs: outsideChoice, both: 'Both', custom: 'Edit' }
  return conflict.choices.map((kind) => ({ value: kind, label: labels[kind] }))
}

function TypedValue({
  initial,
  label,
  onCommit,
  onCancel,
}: {
  initial: string
  label: string
  onCommit: (value: string) => void
  onCancel: () => void
}) {
  const done = useRef(false)
  const finish = (value: string | null) => {
    if (done.current) return
    done.current = true
    if (value === null) onCancel()
    else onCommit(value)
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      finish(event.currentTarget.value)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      finish(null)
    }
  }
  return (
    <Input
      autoFocus
      defaultValue={initial}
      aria-label={label}
      className="h-7 text-xs md:text-xs"
      onKeyDown={onKeyDown}
      onBlur={(event) => finish(event.currentTarget.value)}
    />
  )
}

function ClashItem({
  review,
  conflict,
  selected,
  onSelect,
}: {
  review: OutsideReview
  conflict: MergeConflict
  selected: boolean
  onSelect: () => void
}) {
  const copy = storageCopy()
  const titleId = useId()
  const [editing, setEditing] = useState(false)
  const element = conflictElement(review, conflict)
  const name = `${element}, ${conflict.label.toLowerCase()}`
  const choice = review.choices.get(conflict.key)
  const pick = (kind: MergeChoiceKind) => {
    onSelect()
    if (kind === 'custom') {
      setEditing(true)
      return
    }
    setEditing(false)
    chooseMerge([conflict.key], { kind })
  }
  const commit = (value: string) => {
    setEditing(false)
    chooseMerge([conflict.key], { kind: 'custom', value })
  }

  return (
    <li>
      <div
        role="group"
        aria-labelledby={titleId}
        className={cn(
          'space-y-2.5 rounded-lg border bg-background px-3 py-2.5 transition-colors',
          selected && 'border-flow',
        )}
      >
        <button
          type="button"
          id={titleId}
          aria-pressed={selected}
          onClick={onSelect}
          className="flex w-full min-w-0 items-baseline gap-1.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="truncate font-medium">{element}</span>
          <span className="shrink-0 text-muted-foreground">{conflict.label}</span>
          {!choice && <span className="ml-auto shrink-0 pl-2 text-xs text-destructive">Needs a choice</span>}
        </button>
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <ValueCell term="Yours" view={valueView(conflict, 'mine')} />
          <ValueCell term={copy.outsideChoice} view={valueView(conflict, 'theirs')} />
        </dl>
        {editing && (
          <TypedValue
            initial={choice?.kind === 'custom' ? choice.value : resultText(review, conflict)}
            label={`New ${conflict.label.toLowerCase()} for ${element}`}
            onCommit={commit}
            onCancel={() => setEditing(false)}
          />
        )}
        {!editing && choice?.kind === 'custom' && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex w-full min-w-0 items-baseline gap-1.5 rounded-sm text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="shrink-0 text-muted-foreground">Typed</span>
            <span className="truncate">{choice.value || 'Empty'}</span>
          </button>
        )}
        <Segmented
          label={`Choice for ${name}`}
          value={editing ? 'custom' : (choice?.kind ?? null)}
          options={choiceOptions(conflict, copy.outsideChoice)}
          onChange={pick}
        />
      </div>
    </li>
  )
}

function Legend() {
  const items = [
    { label: 'Changed', className: 'border-foreground' },
    { label: 'Needs a choice', className: 'border-destructive' },
    { label: 'Selected', className: 'border-flow' },
  ]
  return (
    <ul aria-label="Marks on the canvases" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden className={cn('size-3 rounded-[3px] border-2', item.className)} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

function ClashPanel({
  review,
  selectedKey,
  onSelect,
}: {
  review: OutsideReview
  selectedKey: string | null
  onSelect: (key: string) => void
}) {
  const copy = storageCopy()
  const { conflicts, droppedEdges, detachedNodes } = review.result
  const keys = conflicts.map((conflict) => conflict.key)
  const open = conflicts.filter((conflict) => !review.choices.has(conflict.key)).length
  const theirChanges = useMemo(() => describeChange(review.base, review.theirs), [review.base, review.theirs])
  const myChanges = useMemo(() => describeChange(review.base, review.mine), [review.base, review.mine])

  return (
    <aside
      aria-label="Review the changes"
      className="flex min-h-0 shrink-0 flex-col bg-panel max-md:h-1/2 max-md:border-t md:w-96 md:border-l"
    >
      <header className="flex h-10 shrink-0 items-center gap-3 border-b px-3">
        <h2 className="text-[13px] font-medium whitespace-nowrap">Review the changes</h2>
        <p className="ml-auto text-xs whitespace-nowrap text-muted-foreground">
          {conflicts.length === 0
            ? 'Nothing needs a choice'
            : open === 0
              ? 'All chosen'
              : `${open} of ${conflicts.length} need a choice`}
        </p>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-3 text-[13px]">
          <Legend />
          {conflicts.length > 1 && (
            <div className="grid grid-cols-2 gap-1.5">
              <Button size="sm" variant="outline" onClick={() => chooseMerge(keys, { kind: 'mine' })}>
                All yours
              </Button>
              <Button size="sm" variant="outline" onClick={() => chooseMerge(keys, { kind: 'theirs' })}>
                All {copy.fromOutside}
              </Button>
            </div>
          )}
          {conflicts.length > 0 && (
            <ul aria-label="Changes that need a choice" className="space-y-2">
              {conflicts.map((conflict) => (
                <ClashItem
                  key={conflict.key}
                  review={review}
                  conflict={conflict}
                  selected={conflict.key === selectedKey}
                  onSelect={() => onSelect(conflict.key)}
                />
              ))}
            </ul>
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

type PaneId = 'mine' | 'theirs' | 'result'

function ReviewLayout({ review }: { review: OutsideReview }) {
  const copy = storageCopy()
  const narrow = useWindowSize().width < NARROW_SCREEN_PX
  const [selectedKey, setSelectedKey] = useState<string | null>(() => review.result.conflicts[0]?.key ?? null)
  const [tab, setTab] = useState<PaneId>('result')
  const focus = review.result.conflicts.find((conflict) => conflict.key === selectedKey) ?? null
  const selectedElement = focus ? conflictElementKey(focus) : null

  const mineChanged = useMemo(() => changedMarks(changedElements(review.base, review.mine)), [review.base, review.mine])
  const theirsChanged = useMemo(
    () => changedMarks(changedElements(review.base, review.theirs)),
    [review.base, review.theirs],
  )
  const resultOpen = useMemo(() => resultMarks(review), [review])
  const mineMarks = useMemo(() => withSelection(mineChanged, selectedElement), [mineChanged, selectedElement])
  const theirsMarks = useMemo(() => withSelection(theirsChanged, selectedElement), [theirsChanged, selectedElement])
  const resultMarksShown = useMemo(() => withSelection(resultOpen, selectedElement), [resultOpen, selectedElement])
  const marks: Record<PaneId, Marks> = { mine: mineMarks, theirs: theirsMarks, result: resultMarksShown }
  const selectElement = (key: string) => {
    const found = review.result.conflicts.find((conflict) => conflictElementKey(conflict) === key)
    if (found) setSelectedKey(found.key)
  }
  const panes: Record<PaneId, { label: string; diagram: Diagram }> = {
    mine: { label: 'Yours', diagram: review.mine },
    theirs: { label: copy.outsidePane, diagram: review.theirs },
    result: { label: 'Result', diagram: review.result.diagram },
  }
  const pane = (id: PaneId, className?: string) => (
    <MergePane
      key={id}
      label={panes[id].label}
      className={className}
      diagram={panes[id].diagram}
      marks={marks[id]}
      focus={focus}
      onSelectElement={selectElement}
    />
  )
  const list = <ClashPanel review={review} selectedKey={selectedKey} onSelect={setSelectedKey} />

  if (narrow) {
    return (
      <div className="absolute inset-0 z-[15] flex flex-col bg-background" data-merge-review>
        <Tabs value={tab} onValueChange={(value) => setTab(value as PaneId)} className="min-h-0 flex-1 gap-0">
          <TabsList aria-label="Versions" className="mx-3 my-2 w-[calc(100%-1.5rem)]">
            {(['mine', 'theirs', 'result'] as const).map((id) => (
              <TabsTrigger key={id} value={id}>
                {panes[id].label}
              </TabsTrigger>
            ))}
          </TabsList>
          {(['mine', 'theirs', 'result'] as const).map((id) => (
            <TabsContent key={id} value={id} className="relative min-h-0">
              {pane(id, 'absolute inset-0')}
            </TabsContent>
          ))}
        </Tabs>
        {list}
      </div>
    )
  }
  return (
    <div className="absolute inset-0 z-[15] flex bg-background" data-merge-review>
      <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,2fr)_minmax(0,3fr)] gap-px bg-border">
        <div className="grid min-h-0 grid-cols-2 gap-px">
          {pane('mine')}
          {pane('theirs')}
        </div>
        {pane('result')}
      </div>
      {list}
    </div>
  )
}

/**
 * Covers the editor canvas with the review of a merge: the open diagram, the version from outside and the merged
 * result side by side, and the list of conflicts with a choice for each one.
 */
export function MergeReview() {
  const review = useOutsideReview((state) => state.review)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelOutsideReview()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return review ? <ReviewLayout review={review} /> : null
}
