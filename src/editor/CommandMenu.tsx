import { useNavigate } from '@tanstack/react-router'
import { useReactFlow } from '@xyflow/react'
import {
  BookOpen,
  Bot,
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
  History,
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
  updateEdgesTraffic,
} from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { currentDiagram, flushPendingSave } from '@/store/document'
import { redo, undo } from '@/store/history'
import { useSettings } from '@/store/settings-store'
import { setUi, useUi } from '@/store/ui-store'
import { tidyUp } from './layout-command'
import { presetNodeAt } from './preset-node'
import { useFitToScreen } from './fit'
import { DELETE_KEY, FIT_KEYS, keyCombo } from './shortcuts'

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
  const { screenToFlowPosition } = useReactFlow()
  const fit = useFitToScreen()
  const setTheme = useSettings((state) => state.setTheme)

  const run = (action: () => void) => () => {
    setUi({ commandOpen: false })
    action()
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(value) => setUi({ commandOpen: value })}
      title="Command menu"
      description="Search for an action"
    >
      <CommandInput placeholder="Search for an action…" />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>Nothing matches your search.</CommandEmpty>
        <CommandGroup heading="Diagram">
          <CommandItem onSelect={run(undo)}>
            <Undo2 /> Undo <CommandShortcut>{keyCombo('Z', { mod: true })}</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(redo)}>
            <Redo2 /> Redo <CommandShortcut>{keyCombo('Z', { mod: true, shift: true })}</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(() => setUi({ historyOpen: true }))}>
            <History /> Show version history
          </CommandItem>
          <CommandItem onSelect={run(() => setUi({ sensitiveView: !useUi.getState().sensitiveView }))}>
            <ShieldAlert /> Show or hide sensitive data
          </CommandItem>
          <CommandItem onSelect={run(duplicateSelection)}>
            <CopyPlus /> Duplicate selection <CommandShortcut>{keyCombo('D', { mod: true })}</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(groupSelection)}>
            <Group /> Group selection <CommandShortcut>{keyCombo('G', { mod: true })}</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(deleteSelection)}>
            <Trash2 /> Delete selection <CommandShortcut>{DELETE_KEY}</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(fit)}>
            <Maximize /> Fit to screen <CommandShortcut>{FIT_KEYS}</CommandShortcut>
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
