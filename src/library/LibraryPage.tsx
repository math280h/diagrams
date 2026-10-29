import { Link, useNavigate } from '@tanstack/react-router'
import {
  AppWindow,
  ArrowRight,
  Copy,
  Download,
  FileUp,
  FolderOpen,
  Megaphone,
  MoreHorizontal,
  Pencil,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { isDesktop } from '@/desktop/bridge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AppMark } from '@/components/AppMark'
import { GitHubMark } from '@/components/GitHubMark'
import { ThemeToggle } from '@/components/ThemeToggle'
import { AgentButton } from '@/desktop/AgentButton'
import { useAgentIntroVisible } from '@/desktop/agent-store'
import { REPOSITORY_URL } from '@/desktop/constants'
import { AgentIntro } from '@/desktop/AgentIntro'
import { desktopApi } from '@/desktop/bridge'
import { canOpenInApp, openInApp, useOpenedInApp } from '@/desktop/open-in-app'
import { TitleBarNav } from '@/desktop/TitleBarNav'
import { ImportDialog } from '@/io/ImportDialog'
import { formatBytes, plural, relativeTime } from '@/lib/format'
import { useReducedMotion } from '@/lib/motion'
import { useIdleMount } from '@/lib/idle-mount'
import { useInView } from '@/lib/use-in-view'
import type { Diagram } from '@/model/schema'
import {
  createBlankDiagram,
  deleteDiagram,
  discardUnusedBlankDiagrams,
  duplicateDiagram,
  exportDiagramJson,
  renameDiagram,
  saveImported,
} from '@/persistence/library-actions'
import { loadDiagramOrNull, repository } from '@/persistence/active-repository'
import type { DiagramMeta } from '@/persistence/repository'
import { storageCopy } from '@/persistence/storage-copy'
import { useLibrary } from '@/store/library-store'
import { TEMPLATES, type Template } from '@/templates'
import { LivePreview } from './LivePreview'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/error-message'
import { openDiagramFiles, showDiagramFile } from '@/desktop/linked-files'

const FEATURED_ID = 'order-system'

function useHoverPlay() {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  return {
    playing: hovered || focused,
    handlers: {
      onPointerEnter: () => setHovered(true),
      onPointerLeave: () => setHovered(false),
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
    },
  }
}

/** The distance below and above the visible part of the library at which a preview starts to mount. */
const PREVIEW_MOUNT_MARGIN = '100% 0px'

/** The lowest zoom of a template card. A larger template shows its busiest part instead of all of it. */
const TEMPLATE_CARD_MIN_ZOOM = 0.45

function PreviewFrame({ diagram, playing, minZoom }: { diagram: Diagram; playing: boolean; minZoom: number }) {
  const [ref, near] = useInView(PREVIEW_MOUNT_MARGIN, true)
  const mounted = useIdleMount(near)
  return (
    <div ref={ref} className="relative aspect-[16/10] w-full overflow-hidden border-b bg-background">
      <div className="absolute inset-0">
        {mounted && <LivePreview diagram={diagram} playing={playing} minZoom={minZoom} paddingPx={16} />}
      </div>
    </div>
  )
}

/** Returns the end of a file path, with its folder, for example `docs/orders.diagram.json`. */
function fileLabel(file: string): string {
  return file.split(/[\\/]/).slice(-2).join('/')
}

function DiagramCard({ meta, onRename, onDelete }: { meta: DiagramMeta; onRename: () => void; onDelete: () => void }) {
  const navigate = useNavigate()
  const diagram = useMemo(() => loadDiagramOrNull(meta.id), [meta])
  const openedInApp = useOpenedInApp((state) => state.opened[meta.id] !== undefined)
  const { playing, handlers } = useHoverPlay()

  return (
    <div
      {...handlers}
      className="group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/25 focus-within:border-foreground/25"
    >
      <Link to="/d/$diagramId" params={{ diagramId: meta.id }} tabIndex={-1} aria-hidden className="block">
        {diagram ? (
          <PreviewFrame diagram={diagram} playing={playing} minZoom={0} />
        ) : (
          <div className="grid aspect-[16/10] place-items-center border-b text-xs text-muted-foreground">
            This diagram cannot be read
          </div>
        )}
      </Link>
      <div className="flex items-start gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <Link
            to="/d/$diagramId"
            params={{ diagramId: meta.id }}
            className="block truncate text-[15px] font-medium tracking-[-0.01em]"
          >
            {meta.name || 'Untitled diagram'}
          </Link>
          <p className="mt-0.5 flex gap-3 text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">
            <span>{plural(meta.nodeCount, 'node')}</span>
            {meta.flowCount > 0 && <span>{plural(meta.flowCount, 'flow')}</span>}
            {openedInApp && <span className="truncate">Opened in app</span>}
            <span className="ml-auto truncate">{relativeTime(meta.updatedAt)}</span>
          </p>
          {meta.path && (
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground" title={meta.path}>
              {fileLabel(meta.path)}
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Diagram actions" />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => void navigate({ to: '/p/$diagramId', params: { diagramId: meta.id } })}>
              <Play /> Present
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRename}>
              <Pencil /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => duplicateDiagram(meta.id)}>
              <Copy /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => diagram && exportDiagramJson(diagram)} disabled={!diagram}>
              <Download /> Export diagram file
            </DropdownMenuItem>
            {canOpenInApp() && (
              <DropdownMenuItem onClick={() => diagram && openInApp(() => diagram)} disabled={!diagram}>
                <AppWindow /> Open in desktop app
              </DropdownMenuItem>
            )}
            {meta.path && (
              <DropdownMenuItem onClick={() => showDiagramFile(meta.id)}>
                <FolderOpen /> Show in folder
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 /> {meta.path ? 'Remove from library' : 'Delete'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function StorageNote({ usageBytes }: { usageBytes: number }) {
  const location = repository().location
  if (location.kind === 'browser') {
    return (
      <p className="mt-4 text-[13px] text-muted-foreground tabular-nums">
        {formatBytes(usageBytes)} of {formatBytes(location.budgetBytes)} used in this browser. Clearing the site data of
        this browser deletes them, so export a diagram file to keep a copy.
      </p>
    )
  }
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-3 text-[13px] text-muted-foreground">
      <span className="min-w-0 break-all">
        Saved as files in <span className="font-mono">{location.path}</span>
      </span>
      <Button
        variant="link"
        size="xs"
        className="px-0"
        onClick={() => void desktopApi()?.request('files.reveal', null)}
      >
        Show folder
      </Button>
    </p>
  )
}

function TemplateCard({ template, diagram }: { template: Template; diagram: Diagram }) {
  const { playing, handlers } = useHoverPlay()
  return (
    <Link
      {...handlers}
      to="/t/$templateId"
      params={{ templateId: template.id }}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-colors hover:border-foreground/25 focus-visible:border-foreground/25"
    >
      <PreviewFrame diagram={diagram} playing={playing} minZoom={TEMPLATE_CARD_MIN_ZOOM} />
      <div className="px-4 py-3">
        <p className="text-[15px] font-medium tracking-[-0.01em]">{template.name}</p>
        <p className="mt-0.5 text-[13px] leading-5 text-pretty text-muted-foreground">{template.description}</p>
      </div>
    </Link>
  )
}

function FeaturedTemplate({ template, diagram }: { template: Template; diagram: Diagram }) {
  const reducedMotion = useReducedMotion()
  const [ref, inView] = useInView('0px')
  const [started, setStarted] = useState(false)
  const [paused, setPaused] = useState(false)
  const playing = inView && (!reducedMotion || started)
  const flow = diagram.flows[0]
  const showPlay = (reducedMotion && !started) || paused

  return (
    <div
      ref={ref}
      className="flex h-[clamp(360px,calc(100dvh-360px),620px)] flex-col overflow-hidden rounded-2xl border bg-background"
    >
      <div className="flex h-12 shrink-0 items-center gap-3 border-b bg-panel pr-2 pl-4">
        <span className="truncate text-sm font-medium">{template.name}</span>
        {flow && (
          <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground max-sm:hidden">
            <span className="size-1.5 shrink-0 rounded-full bg-flow" />
            <span className="truncate">{flow.name}</span>
          </span>
        )}
        <span className="ml-auto" />
        {flow && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => (reducedMotion && !started ? setStarted(true) : setPaused(!paused))}
          >
            {showPlay ? <Play /> : <Pause />} {showPlay ? 'Play' : 'Pause'}
          </Button>
        )}
        <Link
          to="/t/$templateId"
          params={{ templateId: template.id }}
          className={buttonVariants({ variant: 'secondary', size: 'sm' })}
        >
          Open {template.name} <ArrowRight />
        </Link>
      </div>
      <div className="min-h-0 flex-1">
        <LivePreview diagram={diagram} playing={playing} paused={paused} minZoom={0.5} paddingPx={20} showCaption />
      </div>
    </div>
  )
}

export function LibraryPage() {
  const navigate = useNavigate()
  const items = useLibrary((state) => state.items)
  const usageBytes = useLibrary((state) => state.usageBytes)
  const [importOpen, setImportOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<DiagramMeta | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState<DiagramMeta | null>(null)
  const openFiles = () =>
    void openDiagramFiles().then(
      (ids) => {
        if (ids.length === 1) void navigate({ to: '/d/$diagramId', params: { diagramId: ids[0]! } })
      },
      (error: unknown) => toast.error('The file could not be opened.', { description: errorMessage(error) }),
    )
  const templates = useMemo(() => TEMPLATES.map((template) => ({ ...template, preview: template.build() })), [])
  const agentIntroVisible = useAgentIntroVisible()

  useEffect(() => discardUnusedBlankDiagrams(), [])

  const open = (id: string) => void navigate({ to: '/d/$diagramId', params: { diagramId: id } })

  const createBlank = () => {
    const { diagram, result } = createBlankDiagram()
    if (result.ok) open(diagram.id)
  }

  const text = query.trim().toLowerCase()
  const visible = text ? items.filter((meta) => meta.name.toLowerCase().includes(text)) : items
  const firstRun = items.length === 0

  const [featured, ...others] = templates.toSorted(
    (x, y) => Number(y.id === FEATURED_ID) - Number(x.id === FEATURED_ID),
  )

  return (
    <div className="flex h-full flex-col">
      <header className="dg-titlebar flex h-11 shrink-0 items-center gap-2 border-b bg-panel px-3 [--titlebar-pad:0.75rem]">
        <TitleBarNav />
        <AppMark className="size-5 shrink-0" />
        <span className="text-[15px] font-medium tracking-[-0.02em]">Diagrams</span>
        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          <AgentButton labelled={!agentIntroVisible} />
          {!isDesktop() && (
            <Button
              variant="ghost"
              aria-label="What’s new"
              className="max-sm:hidden"
              nativeButton={false}
              render={<Link to="/releases" />}
            >
              <Megaphone /> <span className="hidden md:inline">What’s new</span>
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <a
                  href={REPOSITORY_URL}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Source code on GitHub"
                  className={buttonVariants({ variant: 'ghost', size: 'icon' })}
                />
              }
            >
              <GitHubMark />
            </TooltipTrigger>
            <TooltipContent>Source code on GitHub</TooltipContent>
          </Tooltip>
          <ThemeToggle />
          {isDesktop() && (
            <Button variant="ghost" aria-label="Open a diagram file" onClick={openFiles}>
              <FolderOpen /> <span className="hidden sm:inline">Open file</span>
            </Button>
          )}
          <Button variant="ghost" aria-label="Import" onClick={() => setImportOpen(true)}>
            <FileUp /> <span className="hidden sm:inline">Import</span>
          </Button>
          <Button onClick={createBlank}>
            <Plus /> New diagram
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          {firstRun ? (
            <>
              <div className="pt-8 pb-8 sm:pt-12">
                <h1 className="dg-display max-w-3xl text-4xl leading-[1.04] sm:text-5xl">
                  Draw how your system works, then play a request through it.
                </h1>
                <p className="mt-4 max-w-xl text-base leading-6 text-pretty text-muted-foreground">
                  Architecture diagrams that move, for docs, pull requests and talks. {storageCopy().promise}
                </p>
              </div>
              <section aria-labelledby="templates-heading">
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 id="templates-heading" className="text-xl font-medium tracking-[-0.015em]">
                    Start from a template that is already playing
                  </h2>
                  <span className="text-[13px] text-muted-foreground">
                    Open one to look around. Choose Use this template to edit a copy.
                  </span>
                </div>
                {featured && <FeaturedTemplate template={featured} diagram={featured.preview} />}
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {others.map((template) => (
                    <TemplateCard key={template.id} template={template} diagram={template.preview} />
                  ))}
                </div>
              </section>
              <AgentIntro className="mt-12" />
            </>
          ) : (
            <>
              <AgentIntro className="mt-8" />
              <section className="pt-10" aria-labelledby="diagrams-heading">
                <div className="mb-5 flex flex-wrap items-center gap-3">
                  <h1 id="diagrams-heading" className="text-2xl font-medium tracking-[-0.02em]">
                    Your diagrams
                  </h1>
                  <span className="text-sm text-muted-foreground tabular-nums">{items.length}</span>
                  <div className="relative ml-auto w-full sm:w-64">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search diagrams"
                      aria-label="Search diagrams"
                      className="h-8 pl-8 text-sm"
                    />
                  </div>
                </div>
                {visible.length === 0 ? (
                  <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
                    No diagram names match “{query.trim()}”.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {visible.map((meta) => (
                      <DiagramCard
                        key={meta.id}
                        meta={meta}
                        onRename={() => {
                          setRenaming(meta)
                          setRenameValue(meta.name)
                        }}
                        onDelete={() => setDeleting(meta)}
                      />
                    ))}
                  </div>
                )}
                <StorageNote usageBytes={usageBytes} />
              </section>
              <section className="mt-16" aria-labelledby="templates-heading">
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 id="templates-heading" className="text-xl font-medium tracking-[-0.015em]">
                    Templates
                  </h2>
                  <span className="text-[13px] text-muted-foreground">
                    Open one to look around. Choose Use this template to edit a copy.
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {templates.map((template) => (
                    <TemplateCard key={template.id} template={template} diagram={template.preview} />
                  ))}
                </div>
              </section>
            </>
          )}
          {!isDesktop() && (
            <footer className="mt-16 border-t pt-6 text-sm text-muted-foreground">
              <Link to="/releases" className="hover:text-foreground">
                What’s new in Diagrams
              </Link>
            </footer>
          )}
        </div>
      </main>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(diagram) => {
          if (saveImported(diagram).ok) {
            setImportOpen(false)
            open(diagram.id)
          }
        }}
      />

      <Dialog open={renaming !== null} onOpenChange={(value) => !value && setRenaming(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename diagram</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (renaming) renameDiagram(renaming.id, renameValue.trim() || 'Untitled diagram')
              setRenaming(null)
            }}
            className="space-y-4"
          >
            <Input
              autoFocus
              aria-label="Diagram name"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button type="submit">Rename</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(value) => !value && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {deleting?.path ? `Remove “${deleting.name}” from the library?` : `Delete “${deleting?.name}”?`}
            </DialogTitle>
            <DialogDescription>
              {deleting?.path ? `The file stays where it is: ${deleting.path}` : storageCopy().deleteDetail}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleting) deleteDiagram(deleting.id)
                setDeleting(null)
              }}
            >
              {deleting?.path ? 'Remove from library' : 'Delete diagram'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
