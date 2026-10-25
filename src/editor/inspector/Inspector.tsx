import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { nodeTitle } from '@/model/labels'
import { CARD_FORM_LABELS } from '@/model/presets'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { DiagramNode } from '@/model/types'
import { useDoc } from '@/store/doc-store'
import { useSettings } from '@/store/settings-store'
import { useUi } from '@/store/ui-store'
import { INSPECTOR_WIDTH } from '@/editor/fit'
import { MultiInspector } from './DiagramInspector'
import { EdgeInspector } from './EdgeInspector'
import { NodeInspector } from './NodeInspector'
import { StepInspector } from './StepInspector'

const NODE_KIND: Record<DiagramNode['type'], string> = { card: 'Node', shape: 'Shape', text: 'Text', group: 'Boundary' }

export function Inspector() {
  const open = useSettings((state) => state.inspectorOpen)
  const setOpen = useSettings((state) => state.setInspectorOpen)
  const nodes = useDoc((state) => state.nodes)
  const edges = useDoc((state) => state.edges)
  const flows = useDoc((state) => state.flows)
  const selectedStepId = useUi((state) => state.selectedStepId)
  const activeFlowId = useUi((state) => state.activeFlowId)
  const flowPanelOpen = useUi((state) => state.flowPanelOpen)

  const selectedNodes = nodes.filter((node) => node.selected)
  const selectedEdges = edges.filter((edge) => edge.selected)
  const flow = flows.find((candidate) => candidate.id === activeFlowId)
  const step = flowPanelOpen && flow ? flow.steps.find((candidate) => candidate.id === selectedStepId) : undefined
  const hasSelection = selectedNodes.length > 0 || selectedEdges.length > 0

  if (!hasSelection && !step) return null

  if (!open) {
    return (
      <div className="dg-chrome absolute top-3 right-3 z-10 p-0.5">
        <Tooltip>
          <TooltipTrigger
            render={<Button variant="ghost" size="icon" aria-label="Show properties" onClick={() => setOpen(true)} />}
          >
            <PanelRightOpen />
          </TooltipTrigger>
          <TooltipContent side="left">Show properties</TooltipContent>
        </Tooltip>
      </div>
    )
  }

  let content
  let title: string
  let kind: string
  if (step && flow && !hasSelection) {
    content = <StepInspector flow={flow} step={step} />
    title = `Step ${flow.steps.indexOf(step) + 1}`
    kind = flow.name
  } else if (selectedNodes.length === 1 && selectedEdges.length === 0) {
    const node = selectedNodes[0]!
    content = <NodeInspector node={node} />
    title = nodeTitle(node)
    kind = node.type === 'card' ? CARD_FORM_LABELS[node.data.form] : NODE_KIND[node.type]
  } else if (selectedNodes.length === 0) {
    content = <EdgeInspector edges={selectedEdges} />
    title = selectedEdges.length === 1 ? 'Connection' : `${selectedEdges.length} connections`
    kind = ''
  } else {
    content = <MultiInspector nodes={selectedNodes} />
    title = `${selectedNodes.length + selectedEdges.length} selected`
    kind = ''
  }

  return (
    <aside
      aria-label="Properties"
      className="z-10 flex shrink-0 flex-col overflow-hidden bg-panel max-md:absolute max-md:inset-x-0 max-md:bottom-0 max-md:h-[55%] max-md:border-t md:h-full md:w-(--inspector-width) md:border-l"
      style={{ '--inspector-width': `${INSPECTOR_WIDTH}px` } as React.CSSProperties}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b pr-1 pl-3">
        <h2 className="min-w-0 truncate text-[13px] font-medium">{title}</h2>
        {kind && <span className="shrink-0 truncate text-xs text-muted-foreground">{kind}</span>}
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label="Hide properties"
          onClick={() => setOpen(false)}
        >
          <PanelRightClose />
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1">{content}</ScrollArea>
    </aside>
  )
}
