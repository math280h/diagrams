import { Link, useNavigate } from '@tanstack/react-router'
import {
  AppWindow,
  BookOpen,
  ChevronDown,
  Command,
  Download,
  Film,
  FileCode,
  FileCode2,
  FileJson,
  FileText,
  FolderOutput,
  Globe,
  Link2,
  History,
  Image,
  Play,
  Plus,
  Redo2,
  SlidersHorizontal,
  Undo2,
  Waypoints,
} from 'lucide-react'
import { useState } from 'react'
import { AppMark } from '@/components/AppMark'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AgentButton } from '@/desktop/AgentButton'
import { canOpenInApp, openInApp } from '@/desktop/open-in-app'
import { TitleBarNav } from '@/desktop/TitleBarNav'
import { exportDiagramJson } from '@/persistence/library-actions'
import { setName } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { currentDiagram, flushPendingSave } from '@/store/document'
import { redo, undo, useHistory } from '@/store/history'
import { setUi, useUi } from '@/store/ui-store'
import { useVersions } from '@/store/versions'
import { StylePanel } from './inspector/DiagramInspector'
import { openInsertAtCenter } from './insert'
import { keyCombo } from './shortcuts'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/error-message'
import { isDesktop } from '@/desktop/bridge'
import { saveDiagramAsFile, showDiagramFile } from '@/desktop/linked-files'
import { useLibrary } from '@/store/library-store'

function IconButton({
  label,
  shortcut,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  /** If set, the button is a toggle in this state. */
  pressed?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={pressed ? 'secondary' : 'ghost'}
            size="icon"
            aria-label={label}
            aria-pressed={pressed}
            onClick={onClick}
            disabled={disabled}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && <span className="ml-2 text-muted-foreground">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  )
}

function NameField() {
  const name = useDoc((state) => state.name)
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <Input
      aria-label="Diagram name"
      spellCheck={false}
      value={draft ?? name}
      onFocus={() => setDraft(name)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== null && draft.trim() !== name) setName(draft.trim() || 'Untitled diagram')
        setDraft(null)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === 'Escape') {
          if (event.key === 'Escape') setDraft(null)
          event.currentTarget.blur()
        }
      }}
      className="w-24 truncate border-transparent bg-transparent px-2 py-0 text-sm font-medium tracking-[-0.01em] hover:bg-accent focus:bg-accent focus-visible:border-transparent dark:bg-transparent max-sm:flex-1 sm:w-56"
    />
  )
}

function LinkedFileMark({ id }: { id: string | null }) {
  const file = useLibrary((state) => state.items.find((item) => item.id === id)?.path)
  if (!id || !file) return null
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={`Saved in ${file}`} onClick={() => showDiagramFile(id)} />
        }
      >
        <FileCode2 />
      </TooltipTrigger>
      <TooltipContent>Saved in {file}</TooltipContent>
    </Tooltip>
  )
}

async function saveAsFile(navigateTo: (id: string) => void) {
  flushPendingSave()
  try {
    const id = await saveDiagramAsFile(currentDiagram())
    if (id) navigateTo(id)
  } catch (error) {
    toast.error('The file could not be saved.', { description: errorMessage(error) })
  }
}

export function TopBar() {
  const navigate = useNavigate()
  const id = useDoc((state) => state.id)
  const { canUndo, canRedo } = useHistory()
  const flowPanelOpen = useUi((state) => state.flowPanelOpen)
  const historyOpen = useUi((state) => state.historyOpen)
  const previewing = useVersions((state) => state.previewId !== null)

  return (
    <header className="dg-titlebar z-20 flex h-11 shrink-0 items-center gap-1 border-b bg-panel px-1.5">
      <TitleBarNav />
      <Tooltip>
        <TooltipTrigger
          render={
            <Link to="/" aria-label="All diagrams" className={buttonVariants({ variant: 'ghost', size: 'icon' })} />
          }
        >
          <AppMark className="size-5" />
        </TooltipTrigger>
        <TooltipContent>All diagrams</TooltipContent>
      </Tooltip>
      <div inert={previewing} className="flex min-w-0 items-center gap-1 max-sm:flex-1 inert:opacity-50">
        <NameField />
        <LinkedFileMark id={id} />
        <Separator orientation="vertical" className="mx-1 h-5 max-sm:hidden data-vertical:self-center" />
        <IconButton label="Undo" shortcut={keyCombo('Z', { mod: true })} onClick={undo} disabled={!canUndo}>
          <Undo2 />
        </IconButton>
        <IconButton
          label="Redo"
          shortcut={keyCombo('Z', { mod: true, shift: true })}
          onClick={redo}
          disabled={!canRedo}
        >
          <Redo2 />
        </IconButton>
        <Separator orientation="vertical" className="mx-1 h-5 max-sm:hidden data-vertical:self-center" />
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" aria-label="Insert" onClick={openInsertAtCenter} />}>
            <Plus /> <span className="hidden md:inline">Insert</span>
            <Kbd className="hidden md:inline-flex">N</Kbd>
          </TooltipTrigger>
          <TooltipContent>Insert a node</TooltipContent>
        </Tooltip>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <AgentButton />
        <div inert={previewing} className="hidden items-center gap-1 sm:flex inert:opacity-50">
          <IconButton
            label="Command menu"
            shortcut={keyCombo('K', { mod: true })}
            onClick={() => setUi({ commandOpen: true })}
          >
            <Command />
          </IconButton>
          <Popover>
            <Tooltip>
              <TooltipTrigger
                render={<PopoverTrigger render={<Button variant="ghost" size="icon" aria-label="Style and theme" />} />}
              >
                <SlidersHorizontal />
              </TooltipTrigger>
              <TooltipContent>Style and theme</TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-80 p-0">
              <ScrollArea className="max-h-[70vh]">
                <StylePanel />
              </ScrollArea>
            </PopoverContent>
          </Popover>
          <Separator orientation="vertical" className="mx-1 h-5 data-vertical:self-center" />
        </div>
        <IconButton label="Version history" pressed={historyOpen} onClick={() => setUi({ historyOpen: !historyOpen })}>
          <History />
        </IconButton>
        <Button
          variant={flowPanelOpen ? 'secondary' : 'ghost'}
          aria-label="Flows"
          aria-pressed={flowPanelOpen}
          onClick={() => setUi({ flowPanelOpen: !flowPanelOpen })}
        >
          <Waypoints /> <span className="hidden md:inline">Flows</span>
        </Button>
        <Button
          variant="ghost"
          aria-label="Present"
          onClick={() => {
            flushPendingSave()
            if (id) void navigate({ to: '/p/$diagramId', params: { diagramId: id } })
          }}
        >
          <Play /> <span className="hidden md:inline">Present</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button aria-label="Export" />}>
            <Download /> <span className="hidden md:inline">Export</span>
            <ChevronDown className="hidden opacity-60 md:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onClick={() => setUi({ exportOpen: 'image' })}>
              <Image /> Image (PNG, SVG)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setUi({ exportOpen: 'video' })}>
              <Film /> Animation (MP4, WebM, GIF)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setUi({ exportOpen: 'readme' })}>
              <BookOpen /> README (dark and light images)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setUi({ exportOpen: 'page' })}>
              <Globe /> Web page (HTML)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setUi({ exportOpen: 'link' })}>
              <Link2 /> Share link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setUi({ exportOpen: 'mermaid' })}>
              <FileCode /> Mermaid (flowchart or sequence)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setUi({ exportOpen: 'text' })}>
              <FileText /> Description (alt text)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => exportDiagramJson(currentDiagram())}>
              <FileJson /> Diagram file (JSON)
            </DropdownMenuItem>
            {isDesktop() && (
              <DropdownMenuItem
                onClick={() =>
                  void saveAsFile((diagramId) => void navigate({ to: '/d/$diagramId', params: { diagramId } }))
                }
              >
                <FolderOutput /> Save as a file…
              </DropdownMenuItem>
            )}
            {canOpenInApp() && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    openInApp(() => {
                      flushPendingSave()
                      return currentDiagram()
                    })
                  }
                >
                  <AppWindow /> Open in desktop app
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
