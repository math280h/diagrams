import { useNavigate } from '@tanstack/react-router'
import { useReactFlow } from '@xyflow/react'
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpToLine,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Waypoints,
  Group,
  LayoutGrid,
  Maximize,
  MousePointerSquareDashed,
  Plus,
  Palette,
  Pin,
  PinOff,
  Scissors,
  Trash2,
  Ungroup,
  ZoomIn,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { swatchColor } from '@/canvas/canvas-theme'
import { COLOR_NAMES, COLORS } from '@/model/colors'
import { takesColor } from '@/model/types'
import {
  arrangeSelection,
  colorNodes,
  deleteSelection,
  duplicateSelection,
  groupSelection,
  pinNodes,
  reverseEdge,
  selectAll,
  ungroupSelection,
} from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { useResolvedAppTheme } from '@/store/settings-store'
import { setUi, useUi } from '@/store/ui-store'
import { flushPendingSave } from '@/store/document'
import { useLibrary } from '@/store/library-store'
import { copySelection, cutSelection, paste } from './clipboard'
import { appendNodeToFlow, appendTargetToFlow } from './flow/record'
import { tidyUp } from './layout-command'
import { useFitToScreen } from './fit'
import { KEYS } from '@/lib/shortcut-keys'

export type ContextTarget =
  | { kind: 'pane' }
  | { kind: 'selection' }
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }

export function CanvasContextMenu({ target, children }: { target: ContextTarget; children: ReactNode }) {
  const { screenToFlowPosition } = useReactFlow()
  const fitToScreen = useFitToScreen()
  const [point, setPoint] = useState({ x: 0, y: 0 })
  const [screenPoint, setScreenPoint] = useState({ x: 0, y: 0 })
  const activeFlowId = useUi((state) => state.activeFlowId)
  const isGroup = useDoc(
    (state) => target.kind === 'node' && state.nodes.some((node) => node.id === target.id && node.type === 'group'),
  )
  const onElement = target.kind !== 'pane'
  const navigate = useNavigate()
  const inside = useLibrary((state) => {
    if (target.kind !== 'node') return undefined
    const node = useDoc.getState().nodes.find((candidate) => candidate.id === target.id)
    const opens = node && (node.type === 'card' || node.type === 'group') ? node.data.opens : undefined
    return state.items.find((item) => item.id === opens)
  })
  const selectedIds = useDoc(useShallow((state) => state.nodes.filter((node) => node.selected).map((node) => node.id)))
  const allPinned = useDoc(
    (state) =>
      selectedIds.length > 0 &&
      state.nodes.every((node) => !selectedIds.includes(node.id) || node.data.pinned === true),
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="absolute inset-0"
        onContextMenu={(event) => {
          setScreenPoint({ x: event.clientX, y: event.clientY })
          setPoint(screenToFlowPosition({ x: event.clientX, y: event.clientY }))
        }}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {onElement && (
          <>
            {target.kind !== 'edge' && (
              <>
                {inside && (
                  <>
                    <ContextMenuItem
                      onClick={() => {
                        flushPendingSave()
                        void navigate({ to: '/d/$diagramId', params: { diagramId: inside.id } })
                      }}
                    >
                      <ZoomIn /> Open {inside.name}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                  </>
                )}
                <ContextMenuItem onClick={() => copySelection()}>
                  <Copy /> Copy <ContextMenuShortcut>{KEYS.copy}</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => cutSelection()}>
                  <Scissors /> Cut <ContextMenuShortcut>{KEYS.cut}</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem onClick={duplicateSelection}>
                  <CopyPlus /> Duplicate <ContextMenuShortcut>{KEYS.duplicate}</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => groupSelection()}>
                  <Group /> Group <ContextMenuShortcut>{KEYS.group}</ContextMenuShortcut>
                </ContextMenuItem>
                {isGroup && (
                  <ContextMenuItem onClick={ungroupSelection}>
                    <Ungroup /> Ungroup <ContextMenuShortcut>{KEYS.ungroup}</ContextMenuShortcut>
                  </ContextMenuItem>
                )}
                <ColorMenu />
                <ContextMenuItem onClick={() => pinNodes(selectedIds, !allPinned)}>
                  {allPinned ? <PinOff /> : <Pin />} {allPinned ? 'Unpin position' : 'Pin position'}
                </ContextMenuItem>
              </>
            )}
            {target.kind === 'edge' && (
              <ContextMenuItem onClick={() => reverseEdge(target.id)}>
                <ArrowLeftRight /> Reverse direction
              </ContextMenuItem>
            )}
            {activeFlowId && (target.kind === 'node' || target.kind === 'edge') && (
              <ContextMenuItem
                onClick={() =>
                  target.kind === 'node'
                    ? appendNodeToFlow(target.id)
                    : appendTargetToFlow({ kind: 'edge', id: target.id })
                }
              >
                <Waypoints /> Add to flow
              </ContextMenuItem>
            )}
            <ContextMenuItem onClick={() => arrangeSelection('front')}>
              <ArrowUpToLine /> Bring to front
            </ContextMenuItem>
            <ContextMenuItem onClick={() => arrangeSelection('back')}>
              <ArrowDownToLine /> Send to back
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={deleteSelection}>
              <Trash2 /> Delete <ContextMenuShortcut>{KEYS.delete}</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}
        {!onElement && (
          <>
            <ContextMenuItem onClick={() => setUi({ insert: { screen: screenPoint, flow: point } })}>
              <Plus /> Insert a node here <ContextMenuShortcut>N</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => paste(undefined, point)}>
              <ClipboardPaste /> Paste here <ContextMenuShortcut>{KEYS.paste}</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={selectAll}>
              <MousePointerSquareDashed /> Select all <ContextMenuShortcut>{KEYS.selectAll}</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => tidyUp('RIGHT', fitToScreen)}>
              <LayoutGrid /> Tidy up, left to right
            </ContextMenuItem>
            <ContextMenuItem onClick={() => tidyUp('DOWN', fitToScreen)}>
              <LayoutGrid className="rotate-90" /> Tidy up, top to bottom
            </ContextMenuItem>
            <ContextMenuItem onClick={fitToScreen}>
              <Maximize /> Fit to screen <ContextMenuShortcut>{KEYS.fit}</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

function ColorMenu() {
  const theme = useResolvedAppTheme()
  const nodes = useDoc(useShallow((state) => state.nodes.filter((node) => node.selected).filter(takesColor)))
  if (nodes.length === 0) return null
  const colors = new Set(nodes.map((node) => node.data.color))
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Palette /> Colour
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="dg-zones w-36 shadow-lg" data-theme={theme}>
        <ContextMenuRadioGroup
          value={colors.size === 1 ? nodes[0]!.data.color : null}
          onValueChange={(value) => {
            const picked = COLORS.find((color) => color === value)
            if (picked)
              colorNodes(
                nodes.map((node) => node.id),
                picked,
              )
          }}
        >
          {COLORS.map((color) => (
            <ContextMenuRadioItem key={color} value={color}>
              <span className="size-3 rounded-full" style={{ background: swatchColor(color) }} />
              {COLOR_NAMES[color]}
            </ContextMenuRadioItem>
          ))}
        </ContextMenuRadioGroup>
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}
