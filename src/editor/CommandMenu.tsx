import { useNavigate } from '@tanstack/react-router'
import { copyDiagramAsPng } from '@/export/image-copy'
import { useReactFlow } from '@xyflow/react'
import { useMemo, useState } from 'react'
import {
  BookOpen,
  Bot,
  Contrast,
  CopyPlus,
  Download,
  FileCode,
  FileInput,
  FileJson,
  FileText,
  Globe,
  Link2,
  Film,
  Waypoints,
  Group,
  Crosshair,
  History,
  ImageDown,
  Image,
  Keyboard,
  LayoutGrid,
  LayoutList,
  Maximize,
  Moon,
  Pin,
  Play,
  Redo2,
  RefreshCw,
  ShieldAlert,
  Sun,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react'
import { Icon } from '@/canvas/icon'
import { openConnectAgent } from '@/desktop/agent-store'
import { isDesktop } from '@/desktop/bridge'
import { checkForUpdates } from '@/desktop/updates'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import { BOUNDARY_PROVIDERS } from '@/model/boundaries'
import { boundaryTitle, nodeTitle } from '@/model/labels'
import { PRESET_CATEGORIES, PRESETS } from '@/model/presets'
import { exportDiagramJson } from '@/persistence/library-actions'
import {
  addFlow,
  addNodes,
  deleteSelection,
  duplicateSelection,
  groupSelection,
  pinNodes,
  selectionPinned,
  selectOnly,
  updateEdgesTraffic,
} from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { currentDiagram, flushPendingSave } from '@/store/document'
import { redo, undo } from '@/store/history'
import { useHighContrast, useSettings } from '@/store/settings-store'
import { setUi, useUi } from '@/store/ui-store'
import { tidyUp } from './layout-command'
import { presetNodeAt } from './preset-node'
import { useFitToScreen } from './fit'
import { KEYS } from '@/lib/shortcut-keys'

const GO_TO_DURATION_MS = 400

const CAPITALIZED_PREFIXES = BOUNDARY_PROVIDERS.map((provider) => provider.prefix).filter(Boolean)

function inSentence(label: string): string {
  const keepCase = /^[A-Z]{2}/.test(label) || CAPITALIZED_PREFIXES.some((prefix) => label.startsWith(prefix))
  return keepCase ? label : `${label.charAt(0).toLowerCase()}${label.slice(1)}`
}

export function CommandMenu() {
  const open = useUi((state) => state.commandOpen)
  const flows = useDoc((state) => state.flows)
  const id = useDoc((state) => state.id)
  const navigate = useNavigate()
  const { screenToFlowPosition, fitView } = useReactFlow()
  const fit = useFitToScreen()
  const setTheme = useSettings((state) => state.setTheme)
  const setContrast = useSettings((state) => state.setContrast)
  const highContrast = useHighContrast()
  const [search, setSearch] = useState('')
  const nodes = useDoc((state) => state.nodes)
  const targets = useMemo(
    () =>
      open
        ? nodes.flatMap((node) =>
            node.type === 'text'
              ? []
              : [{ id: node.id, name: node.type === 'group' ? boundaryTitle(node) : nodeTitle(node) }],
          )
        : [],
    [open, nodes],
  )

  const run = (action: () => void) => () => {
    setUi({ commandOpen: false })
    setSearch('')
    action()
  }

  const goTo = (nodeId: string) => {
    selectOnly([nodeId])
    void fitView({ nodes: [{ id: nodeId }], duration: GO_TO_DURATION_MS, maxZoom: 1.2, padding: 1 })
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(value) => {
        setUi({ commandOpen: value })
        if (!value) setSearch('')
      }}
      title="Command menu"
      description="Search for an action"
    >
      <CommandInput placeholder="Search for an action or a node…" value={search} onValueChange={setSearch} />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>Nothing matches your search.</CommandEmpty>
        {search.trim() !== '' && targets.length > 0 && (
          <CommandGroup heading="Go to">
            {targets.map((target) => (
              <CommandItem
                key={target.id}
                value={`go to ${target.name} ${target.id}`}
                onSelect={run(() => goTo(target.id))}
              >
                <Crosshair /> {target.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Diagram">
          <CommandItem onSelect={run(undo)}>
            <Undo2 /> Undo <CommandShortcut>{KEYS.undo}</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(redo)}>
            <Redo2 /> Redo <CommandShortcut>{KEYS.redo}</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(() => setUi({ historyOpen: true }))}>
            <History /> Show version history
          </CommandItem>
          <CommandItem onSelect={run(() => setUi({ sensitiveView: !useUi.getState().sensitiveView }))}>
            <ShieldAlert /> Show or hide sensitive data
          </CommandItem>
          <CommandItem onSelect={run(copyDiagramAsPng)}>
            <ImageDown /> Copy as a PNG <CommandShortcut>{KEYS.copyImage}</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(duplicateSelection)}>
            <CopyPlus /> Duplicate selection <CommandShortcut>{KEYS.duplicate}</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(groupSelection)}>
            <Group /> Group selection <CommandShortcut>{KEYS.group}</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(deleteSelection)}>
            <Trash2 /> Delete selection <CommandShortcut>{KEYS.delete}</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(fit)}>
            <Maximize /> Fit to screen <CommandShortcut>{KEYS.fit}</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={run(() => {
              const ids = useDoc
                .getState()
                .nodes.filter((node) => node.selected)
                .map((node) => node.id)
              pinNodes(ids, !selectionPinned())
            })}
          >
            <Pin /> Pin or unpin the selection
          </CommandItem>
          <CommandItem onSelect={run(() => void tidyUp('RIGHT', fit))}>
            <LayoutGrid /> Tidy up, left to right
          </CommandItem>
          <CommandItem onSelect={run(() => void tidyUp('DOWN', fit))}>
            <LayoutList /> Tidy up, top to bottom
          </CommandItem>
          <CommandItem
            onSelect={run(() =>
              updateEdgesTraffic(new Set(useDoc.getState().edges.map((edge) => edge.id)), { enabled: true }),
            )}
          >
            <Play /> Animate all connections
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Flows">
          <CommandItem
            onSelect={run(() => {
              const flow = addFlow()
              setUi({ flowPanelOpen: true, activeFlowId: flow.id, recording: true })
            })}
          >
            <Waypoints /> New flow
          </CommandItem>
          <CommandItem onSelect={run(() => setUi({ traceImportOpen: true }))}>
            <FileInput /> Import a trace as a flow
          </CommandItem>
          {flows.map((flow) => (
            <CommandItem
              key={flow.id}
              value={`flow ${flow.name}`}
              onSelect={run(() => setUi({ flowPanelOpen: true, activeFlowId: flow.id }))}
            >
              <Waypoints /> Open flow “{flow.name}”
            </CommandItem>
          ))}
          <CommandItem
            onSelect={run(() => {
              flushPendingSave()
              if (id) void navigate({ to: '/p/$diagramId', params: { diagramId: id } })
            })}
          >
            <Play /> Present
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Export">
          <CommandItem onSelect={run(() => setUi({ exportOpen: 'image' }))}>
            <Image /> Export image
          </CommandItem>
          <CommandItem onSelect={run(() => setUi({ exportOpen: 'video' }))}>
            <Film /> Export animation
          </CommandItem>
          <CommandItem onSelect={run(() => setUi({ exportOpen: 'readme' }))}>
            <BookOpen /> Export README images
          </CommandItem>
          <CommandItem onSelect={run(() => setUi({ exportOpen: 'page' }))}>
            <Globe /> Export web page
          </CommandItem>
          <CommandItem onSelect={run(() => setUi({ exportOpen: 'link' }))}>
            <Link2 /> Share a link
          </CommandItem>
          <CommandItem onSelect={run(() => setUi({ exportOpen: 'mermaid' }))}>
            <FileCode /> Export Mermaid
          </CommandItem>
          <CommandItem onSelect={run(() => setUi({ exportOpen: 'text' }))}>
            <FileText /> Copy the description
          </CommandItem>
          <CommandItem onSelect={run(() => exportDiagramJson(currentDiagram()))}>
            <FileJson /> Export diagram file
          </CommandItem>
          <CommandItem onSelect={run(() => setUi({ importOpen: true }))}>
            <Upload /> Import Mermaid or JSON
          </CommandItem>
        </CommandGroup>
        {PRESET_CATEGORIES.map((category) => (
          <CommandGroup key={category.id} heading={category.label}>
            {PRESETS.filter((preset) => preset.category === category.id).map((preset) => (
              <CommandItem
                key={preset.id}
                value={`add ${preset.label} ${preset.keywords.join(' ')}`}
                onSelect={run(() => {
                  const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
                  const node = presetNodeAt(preset.id, center)
                  if (node) addNodes([node])
                })}
              >
                <Icon name={preset.icon} className="size-4" /> Add {inSentence(preset.label)}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandGroup heading="App">
          {isDesktop() && (
            <>
              <CommandItem onSelect={run(openConnectAgent)}>
                <Bot /> Connect an agent
              </CommandItem>
              <CommandItem onSelect={run(() => void checkForUpdates())}>
                <RefreshCw /> Check for updates
              </CommandItem>
            </>
          )}
          <CommandItem onSelect={run(() => setTheme('dark'))}>
            <Moon /> Dark theme
          </CommandItem>
          <CommandItem onSelect={run(() => setTheme('light'))}>
            <Sun /> Light theme
          </CommandItem>
          <CommandItem onSelect={run(() => setContrast(highContrast ? 'standard' : 'high'))}>
            <Contrast /> {highContrast ? 'Standard contrast canvas' : 'High contrast canvas'}
          </CommandItem>
          <CommandItem onSelect={run(() => setUi({ shortcutsOpen: true }))}>
            <Keyboard /> Keyboard shortcuts <CommandShortcut>?</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(() => void navigate({ to: '/' }))}>
            <Download className="rotate-180" /> Go to all diagrams
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
