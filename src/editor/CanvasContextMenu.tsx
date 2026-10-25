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
  Scissors,
  Trash2,
  Ungroup,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  arrangeSelection,
  deleteSelection,
  duplicateSelection,
  groupSelection,
  reverseEdge,
  selectAll,
  ungroupSelection,
} from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { useUi } from '@/store/ui-store'
import { copySelection, cutSelection, paste } from './clipboard'
import { appendNodeToFlow, appendTargetToFlow } from './flow/record'
import { tidyUp } from './layout-command'
import { useFitToScreen } from './fit'
import { DELETE_KEY, FIT_KEYS, keyCombo } from './shortcuts'

export type ContextTarget =
  | { kind: 'pane' }
  | { kind: 'selection' }
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }

export function CanvasContextMenu({ target, children }: { target: ContextTarget; children: ReactNode }) {
  const { screenToFlowPosition } = useReactFlow()
  const fitToScreen = useFitToScreen()
  const [point, setPoint] = useState({ x: 0, y: 0 })
  const activeFlowId = useUi((state) => state.activeFlowId)
  const isGroup = useDoc(
    (state) => target.kind === 'node' && state.nodes.some((node) => node.id === target.id && node.type === 'group'),
  )
  const onElement = target.kind !== 'pane'

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="absolute inset-0"
        onContextMenu={(event) => setPoint(screenToFlowPosition({ x: event.clientX, y: event.clientY }))}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {onElement && (
          <>
            {target.kind !== 'edge' && (
              <>
                <ContextMenuItem onClick={() => copySelection()}>
                  <Copy /> Copy <ContextMenuShortcut>{keyCombo('C', { mod: true })}</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => cutSelection()}>
                  <Scissors /> Cut <ContextMenuShortcut>{keyCombo('X', { mod: true })}</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem onClick={duplicateSelection}>
                  <CopyPlus /> Duplicate <ContextMenuShortcut>{keyCombo('D', { mod: true })}</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => groupSelection()}>
                  <Group /> Group <ContextMenuShortcut>{keyCombo('G', { mod: true })}</ContextMenuShortcut>
                </ContextMenuItem>
                {isGroup && (
                  <ContextMenuItem onClick={ungroupSelection}>
                    <Ungroup /> Ungroup{' '}
                    <ContextMenuShortcut>{keyCombo('G', { mod: true, shift: true })}</ContextMenuShortcut>
                  </ContextMenuItem>
                )}
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
              <Trash2 /> Delete <ContextMenuShortcut>{DELETE_KEY}</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}
        {!onElement && (
          <>
            <ContextMenuItem onClick={() => paste(undefined, point)}>
              <ClipboardPaste /> Paste here <ContextMenuShortcut>{keyCombo('V', { mod: true })}</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={selectAll}>
              <MousePointerSquareDashed /> Select all{' '}
              <ContextMenuShortcut>{keyCombo('A', { mod: true })}</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => tidyUp('RIGHT', fitToScreen)}>
              <LayoutGrid /> Tidy up, left to right
            </ContextMenuItem>
            <ContextMenuItem onClick={() => tidyUp('DOWN', fitToScreen)}>
              <LayoutGrid className="rotate-90" /> Tidy up, top to bottom
            </ContextMenuItem>
            <ContextMenuItem onClick={fitToScreen}>
              <Maximize /> Fit to screen <ContextMenuShortcut>{FIT_KEYS}</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
