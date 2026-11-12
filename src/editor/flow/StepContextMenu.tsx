import { MousePointerSquareDashed, Trash2 } from 'lucide-react'
import type { ComponentProps } from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { KEYS } from '@/lib/shortcut-keys'
import { selectOnly } from '@/store/actions'
import { useUi } from '@/store/ui-store'
import { deleteSelectedSteps, selectAllSteps, selectStepForMenu } from './step-selection'

function stepIdAt(target: EventTarget): string | undefined {
  return target instanceof Element ? target.closest<HTMLElement>('[data-step-id]')?.dataset.stepId : undefined
}

/**
 * Renders an element that opens the step menu on a right-click. A right-click on a descendant with `data-step-id`
 * selects that step first, see {@link selectStepForMenu}.
 */
export function StepContextMenu(props: Omit<ComponentProps<typeof ContextMenuTrigger>, 'onContextMenu'>) {
  const count = useUi((state) => state.selectedStepIds.length)
  return (
    <ContextMenu>
      <ContextMenuTrigger
        {...props}
        onContextMenu={(event) => {
          const stepId = stepIdAt(event.target)
          if (stepId) selectStepForMenu(stepId)
        }}
      />
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={selectAllSteps}>
          <MousePointerSquareDashed /> Select all steps <ContextMenuShortcut>{KEYS.selectAll}</ContextMenuShortcut>
        </ContextMenuItem>
        {count > 0 && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onClick={() => {
                selectOnly([])
                deleteSelectedSteps()
              }}
            >
              <Trash2 /> {count === 1 ? 'Delete step' : `Delete ${count} steps`}
              <ContextMenuShortcut>{KEYS.delete}</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
