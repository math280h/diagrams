import { ChevronDown, Plus, Split, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { newId } from '@/model/defaults'
import { findPath, rejoinCandidates } from '@/model/flow'
import type { Flow, FlowPath } from '@/model/schema'
import { updateFlow } from '@/store/actions'
import { setUi, useUi } from '@/store/ui-store'
import { Choice, Field, TextInput } from '@/editor/inspector/controls'
import { stepLine } from './names'

const MAIN = 'main'
const END = 'end'

function stepLabel(flow: Flow, stepId: string): string {
  const index = flow.steps.findIndex((step) => step.id === stepId)
  const step = flow.steps[index]
  return step ? `Step ${index + 1}: ${stepLine(step).element}` : 'A missing step'
}

function editPath(flow: Flow, pathId: string, recipe: (path: FlowPath) => void, key?: string) {
  updateFlow(
    flow.id,
    (draft) => {
      const path = findPath(draft, pathId)
      if (path) recipe(path)
    },
    key,
  )
}

function PathSettings({ flow, path }: { flow: Flow; path: FlowPath }) {
  const rejoin = path.rejoinStep ?? END
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={<PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Path settings" />} />}
        >
          <Split />
        </TooltipTrigger>
        <TooltipContent>Path settings</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-80 space-y-3" align="start" side="top">
        <Field label="Name">
          <TextInput
            value={path.name}
            onChange={(name) => editPath(flow, path.id, (draft) => void (draft.name = name), `path-name:${path.id}`)}
          />
        </Field>
        <Field label="Starts after">
          <p className="truncate text-xs text-muted-foreground">{stepLabel(flow, path.fromStep)}</p>
        </Field>
        <Field label="Then">
          <Choice
            label="After the path"
            value={rejoin}
            onChange={(value) =>
              editPath(flow, path.id, (draft) => void (draft.rejoinStep = value === END ? null : value))
            }
            options={[
              { value: END, label: 'The flow ends' },
              ...rejoinCandidates(flow, path).map((step) => ({
                value: step.id,
                label: `Back to ${stepLabel(flow, step.id).replace(/^Step/, 'step')}`,
              })),
            ]}
          />
        </Field>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            updateFlow(flow.id, (draft) => {
              draft.paths = draft.paths?.filter((candidate) => candidate.id !== path.id)
            })
            setUi({ activePathId: null, selectedStepId: null })
          }}
        >
          <Trash2 /> Delete path
        </Button>
      </PopoverContent>
    </Popover>
  )
}

/** Chooses the path of the flow that plays, starts a new path, and changes the active path. */
export function PathMenu({ flow }: { flow: Flow }) {
  const path = findPath(
    flow,
    useUi((state) => state.activePathId),
  )
  const selectedStepId = useUi((state) => state.selectedStepId)
  const fromIndex = flow.steps.findIndex((step) => step.id === selectedStepId)
  const paths = flow.paths ?? []

  const startPath = () => {
    const from = flow.steps[fromIndex]
    if (!from) return
    const created: FlowPath = {
      id: newId('p'),
      name: `Path ${paths.length + 1}`,
      fromStep: from.id,
      steps: [],
      rejoinStep: null,
    }
    updateFlow(flow.id, (draft) => {
      draft.paths = [...(draft.paths ?? []), created]
    })
    setUi({ activePathId: created.id, selectedStepId: null, recording: true })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="sm" className="max-w-44" aria-label={`Path: ${path?.name ?? 'Main path'}`} />
          }
        >
          <span className="truncate">{path?.name ?? 'Main path'}</span>
          <ChevronDown className="opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" side="top" align="start">
          <DropdownMenuRadioGroup
            value={path?.id ?? MAIN}
            onValueChange={(id) => setUi({ activePathId: id === MAIN ? null : String(id), selectedStepId: null })}
          >
            <DropdownMenuRadioItem value={MAIN}>Main path</DropdownMenuRadioItem>
            {paths.map((candidate) => (
              <DropdownMenuRadioItem key={candidate.id} value={candidate.id}>
                <span className="truncate">{candidate.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={fromIndex === -1} onClick={startPath}>
            <Plus />
            {fromIndex === -1 ? 'Select a main step to start a path' : `New path after step ${fromIndex + 1}`}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {path && <PathSettings flow={flow} path={path} />}
    </>
  )
}
