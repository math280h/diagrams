import {
  Bot,
  Circle,
  FileDiff,
  FilePlus,
  GitCommitHorizontal,
  PenLine,
  RotateCcw,
  X,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { committedDiagram } from '@/desktop/linked-files'
import { errorMessage } from '@/lib/error-message'
import { useLibrary } from '@/store/library-store'
import { memo, useEffect, useMemo, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { storageCopy } from '@/persistence/storage-copy'
import type { VersionAuthor, VersionMeta } from '@/persistence/version-store'
import { flushPendingSave } from '@/store/document'
import { setUi } from '@/store/ui-store'
import { COMMIT_PREVIEW_ID, MAX_VERSIONS, previewDiagram, previewVersion, useVersions } from '@/store/versions'
import { SidePanel } from '@/editor/SidePanel'
import { groupByDay, versionAuthor, versionSummary, versionTime } from './format'

const CURRENT = 'current'

function showVersion(id: string | null) {
  if (id !== null) flushPendingSave()
  previewVersion(id)
}

const AUTHOR_ICONS: Record<VersionAuthor, LucideIcon> = {
  you: PenLine,
  agent: Bot,
  restore: RotateCcw,
  opened: FilePlus,
  outside: FileDiff,
}

function optionId(id: string) {
  return `version-${id}`
}

const Row = memo(function Row({
  id,
  icon: Icon,
  title,
  time,
  summary,
  selected,
  onSelect,
}: {
  id: string
  icon: LucideIcon
  title: string
  time?: string
  summary: string
  selected: boolean
  /** Shows the row on the canvas. Without it, the row shows the version with its id. */
  onSelect?: () => void
}) {
  return (
    <div
      role="option"
      id={optionId(id)}
      aria-selected={selected}
      onClick={onSelect ?? (() => showVersion(id === CURRENT ? null : id))}
      className={cn(
        'grid cursor-default grid-cols-[16px_1fr] gap-x-2.5 rounded-lg px-2.5 py-2 hover:bg-accent/60',
        selected && 'bg-accent hover:bg-accent',
      )}
    >
      <Icon className={cn('mt-0.5 size-4', selected ? 'text-foreground' : 'text-muted-foreground')} />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 truncate text-[13px] font-medium">{title}</span>
          {time && <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{time}</span>}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs leading-[18px] text-pretty text-muted-foreground">{summary}</p>
      </div>
    </div>
  )
})

/** Lists the saved versions of the open diagram. The canvas shows the selected version. */
export function HistoryPanel() {
  const items = useVersions((state) => state.items)
  const failed = useVersions((state) => state.failed)
  const previewId = useVersions((state) => state.previewId)
  const selected = previewId ?? CURRENT
  const groups = useMemo(() => groupByDay(items), [items])
  const order = [CURRENT, ...items.map((meta) => meta.id)]
  const diagramId = useVersions((state) => state.diagramId)
  const linkedFile = useLibrary((state) => state.items.find((item) => item.id === diagramId)?.path)
  const showCommit = () => {
    if (!diagramId) return
    flushPendingSave()
    committedDiagram(diagramId).then(
      (diagram) => previewDiagram(COMMIT_PREVIEW_ID, diagram),
      (error: unknown) => toast.error('The last commit could not be read.', { description: errorMessage(error) }),
    )
  }

  useEffect(() => () => previewVersion(null), [])

  useEffect(() => {
    document.getElementById(optionId(selected))?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const close = () => setUi({ historyOpen: false })

  const onKeyDown = (event: KeyboardEvent) => {
    const index = order.indexOf(selected)
    const target =
      event.key === 'ArrowDown'
        ? order[Math.min(order.length - 1, index + 1)]
        : event.key === 'ArrowUp'
          ? order[Math.max(0, index - 1)]
          : event.key === 'Home'
            ? order[0]
            : event.key === 'End'
              ? order.at(-1)
              : undefined
    if (target !== undefined) {
      event.preventDefault()
      showVersion(target === CURRENT ? null : target)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      if (previewId) previewVersion(null)
      else close()
    }
  }

  return (
    <SidePanel side="right" label="Version history">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b pr-1 pl-3">
        <h2 className="text-[13px] font-medium">Version history</h2>
        <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Close version history" onClick={close}>
          <X />
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div
          role="listbox"
          aria-label="Versions"
          aria-activedescendant={optionId(selected)}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="p-1.5 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          <Row
            id={CURRENT}
            icon={Circle}
            title="Current version"
            summary="The diagram as it is now. Select a version below to see it on the canvas."
            selected={selected === CURRENT}
          />
          {linkedFile && (
            <Row
              id={COMMIT_PREVIEW_ID}
              icon={GitCommitHorizontal}
              title="Last commit"
              summary="The file as the last commit of its git repository holds it, to compare with the current version."
              selected={selected === COMMIT_PREVIEW_ID}
              onSelect={showCommit}
            />
          )}
          {groups.map((group) => (
            <div key={group.day} role="group" aria-label={group.day}>
              <div role="presentation" className="px-2.5 pt-3 pb-1 text-xs text-muted-foreground">
                {group.day}
              </div>
              {group.items.map((meta: VersionMeta) => (
                <Row
                  key={meta.id}
                  id={meta.id}
                  icon={AUTHOR_ICONS[meta.author]}
                  title={versionAuthor(meta)}
                  time={versionTime(meta.at)}
                  summary={versionSummary(meta)}
                  selected={selected === meta.id}
                />
              ))}
            </div>
          ))}
          {failed && (
            <p className="px-2.5 py-3 text-xs text-destructive">The version history could not be read or saved here.</p>
          )}
        </div>
      </ScrollArea>
      <p className="shrink-0 border-t px-3 py-2.5 text-xs leading-[18px] text-muted-foreground">
        Versions stay {storageCopy().versionsPlace}. The newest {MAX_VERSIONS} versions of each diagram are kept.
      </p>
    </SidePanel>
  )
}
