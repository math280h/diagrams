import {
  ChevronDown,
  Copy,
  FileCode,
  FileInput,
  Play,
  Pause,
  Plus,
  Settings2,
  SkipBack,
  SkipForward,
  Trash2,
  Waypoints,
  X,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ShortcutTooltip } from '@/components/ShortcutTooltip'
import { KEYS } from '@/lib/shortcut-keys'
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
import { useEngine, usePlaybackState } from '@/engine/hooks'
import { cn } from '@/lib/utils'
import { formatDuration, formatSeconds } from '@/lib/format'
import type { Flow } from '@/model/schema'
import { addFlow, deleteFlow, duplicateFlow, updateFlow } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { setUi, useUi } from '@/store/ui-store'
import { Field, Segmented, SwitchField, TextInput } from '@/editor/inspector/controls'
import { IconPicker } from '@/editor/inspector/IconPicker'
import { appendNodeToFlow } from './record'
import { FLOW_PANEL_HEIGHT } from './layout'
import { StepCount } from '@/components/StepCount'
import { stepFlow } from '@/engine/flow/step'
import { flowToMermaidSequence } from '@/export/sequence'
import { LogTable } from './LogTable'
import { PathMenu } from './PathMenu'
import { SequenceView } from './SequenceView'
import { Timeline } from './Timeline'
import { Scrubber } from '@/player/Scrubber'

function TimeReadout() {
  const engine = useEngine()
  const playback = usePlaybackState()
  const elapsedRef = useRef<HTMLSpanElement>(null)
  const leftRef = useRef<HTMLSpanElement>(null)
  const duration = playback.durationMs
  useEffect(() => {
    const write = (time: number) => {
      if (elapsedRef.current) elapsedRef.current.textContent = formatDuration(time)
      if (leftRef.current) leftRef.current.textContent = `${formatSeconds(Math.max(0, duration - time))} left`
    }
    write(engine.playback.time.get())
    return engine.playback.time.on('change', write)
  }, [engine, duration])
  return (
    <span className="flex items-baseline gap-3 font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
      <span>
        <span ref={elapsedRef} className="text-foreground" /> / {formatDuration(duration)}
      </span>
      <span ref={leftRef} className="max-xl:hidden" />
    </span>
  )
}

function FlowSettings({ flow }: { flow: Flow }) {
  const engine = useEngine()
  const playback = usePlaybackState()
  const set = (recipe: (draft: Flow) => void, key?: string) => updateFlow(flow.id, recipe, key)
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={<PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Flow settings" />} />}
        >
          <Settings2 />
        </TooltipTrigger>
        <TooltipContent>Flow settings</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-72 space-y-3" align="start" side="top">
        <Field label="Name">
          <TextInput
            value={flow.name}
            onChange={(name) => set((draft) => void (draft.name = name), `flow-name:${flow.id}`)}
          />
        </Field>
        <Field label="Token label">
          <TextInput
            value={flow.token.label}
            onChange={(label) => set((draft) => void (draft.token.label = label), `token-label:${flow.id}`)}
          />
        </Field>
        <Field label="Token">
          <Segmented
            value={flow.token.shape}
            onChange={(shape) => set((draft) => void (draft.token.shape = shape))}
            options={[
              { value: 'chip', label: 'Chip' },
              { value: 'dot', label: 'Dot' },
            ]}
          />
        </Field>
        {flow.token.shape === 'chip' && (
          <Field label="Token icon">
            <IconPicker
              allowNone
              value={flow.token.icon}
              onChange={(icon) => set((draft) => void (draft.token.icon = icon))}
            />
          </Field>
        )}
        <SwitchField
          label="Dim other elements"
          checked={flow.spotlight}
          onChange={(spotlight) => set((draft) => void (draft.spotlight = spotlight))}
        />
        <SwitchField label="Loop" checked={flow.loop} onChange={(loop) => set((draft) => void (draft.loop = loop))} />
        <SwitchField
          label="Show request and response bodies"
          checked={flow.bodies}
          onChange={(bodies) => set((draft) => void (draft.bodies = bodies))}
        />
        <Field label="Camera">
          <Segmented
            value={flow.cameraStyle}
            onChange={(cameraStyle) => set((draft) => void (draft.cameraStyle = cameraStyle))}
            options={[
              { value: 'frame', label: 'Frame', title: 'Each step gets a frame. The camera moves only when it must.' },
              { value: 'follow', label: 'Follow', title: 'The camera follows the token.' },
              { value: 'still', label: 'Still', title: 'The camera shows the whole diagram and does not move.' },
            ]}
          />
        </Field>
        {flow.cameraStyle === 'frame' && (
          <Field label="Camera moves">
            <Segmented
              value={flow.cameraMotion}
              onChange={(cameraMotion) => set((draft) => void (draft.cameraMotion = cameraMotion))}
              options={[
                { value: 'gentle', label: 'Gentle' },
                { value: 'quick', label: 'Quick' },
                { value: 'slow', label: 'Slow' },
              ]}
            />
          </Field>
        )}
        <SwitchField
          label="Camera follows the flow"
          checked={playback.follow}
          onChange={(follow) => engine.playback.setFollow(follow)}
        />
        <Field label="Speed">
          <Segmented
            value={String(playback.rate) as '0.5' | '1' | '2'}
            onChange={(rate) => engine.playback.setRate(Number(rate))}
            options={[
              { value: '0.5', label: '½×' },
              { value: '1', label: '1×' },
              { value: '2', label: '2×' },
            ]}
          />
        </Field>
      </PopoverContent>
    </Popover>
  )
}

function copySequence(flow: Flow) {
  const { nodes, edges } = useDoc.getState()
  void navigator.clipboard.writeText(flowToMermaidSequence(flow, { nodes, edges })).then(
    () => toast.success('Copied the Mermaid sequence diagram'),
    () => toast.error('Could not copy. Use Export, then Mermaid.'),
  )
}

function FlowMenu({ flows, flow }: { flows: Flow[]; flow: Flow | undefined }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="max-w-48" />}>
        <Waypoints />
        <span className="truncate">{flow?.name ?? 'No flow'}</span>
        <ChevronDown className="opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" side="top" align="start">
        {flows.length > 0 && (
          <>
            <DropdownMenuRadioGroup
              value={flow?.id ?? ''}
              onValueChange={(id) => setUi({ activeFlowId: String(id), activePathId: null, selectedStepId: null })}
            >
              {flows.map((candidate) => (
                <DropdownMenuRadioItem key={candidate.id} value={candidate.id}>
                  <span className="truncate">{candidate.name}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onClick={() => {
            const created = addFlow()
            setUi({ activeFlowId: created.id, selectedStepId: null, recording: true })
          }}
        >
          <Plus /> New flow
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setUi({ traceImportOpen: true })}>
          <FileInput /> Import a trace
        </DropdownMenuItem>
        {flow && (
          <>
            <DropdownMenuItem
              onClick={() => {
                const copy = duplicateFlow(flow.id)
                if (copy) setUi({ activeFlowId: copy.id })
              }}
            >
              <Copy /> Duplicate flow
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => copySequence(flow)}>
              <FileCode /> Copy as Mermaid sequence
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                deleteFlow(flow.id)
                setUi({ activeFlowId: null, selectedStepId: null })
              }}
            >
              <Trash2 /> Delete flow
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function FlowPanel() {
  const engine = useEngine()
  const playback = usePlaybackState()
  const flows = useDoc((state) => state.flows)
  const activeFlowId = useUi((state) => state.activeFlowId)
  const view = useUi((state) => state.flowView)
  const recording = useUi((state) => state.recording)
  const flow = flows.find((candidate) => candidate.id === activeFlowId)
  const selectedNodes = useDoc((state) => state.nodes.filter((node) => node.selected).length)

  return (
    <section
      aria-label="Flow"
      className="z-10 flex shrink-0 flex-col border-t bg-panel"
      style={{ height: FLOW_PANEL_HEIGHT[view] }}
    >
      <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b px-1.5 [scrollbar-width:none] [&>*]:shrink-0">
        <FlowMenu flows={flows} flow={flow} />
        {flow && <FlowSettings flow={flow} />}
        {flow && <PathMenu flow={flow} />}
        <div className="mx-1 h-5 w-px bg-border" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous step"
          onClick={() => stepFlow(engine, -1)}
          disabled={!flow}
        >
          <SkipBack />
        </Button>
        <ShortcutTooltip label={playback.playing ? 'Pause' : 'Play'} keys={KEYS.playPause}>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={playback.playing ? 'Pause' : 'Play'}
            onClick={() => engine.playback.toggle()}
            disabled={!flow || flow.steps.length === 0}
          >
            {playback.playing ? <Pause /> : <Play />}
          </Button>
        </ShortcutTooltip>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next step"
          onClick={() => stepFlow(engine, 1)}
          disabled={!flow}
        >
          <SkipForward />
        </Button>
        <StepCount className="ml-1" />
        <div className="mx-2 flex min-w-48 flex-1 items-center gap-3">
          <Scrubber />
          <TimeReadout />
        </div>
        <div className="mx-1 h-5 w-px bg-border" />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={recording ? 'secondary' : 'ghost'}
                size="sm"
                disabled={!flow}
                onClick={() => setUi({ recording: !recording })}
              />
            }
          >
            <span className={cn('size-2 rounded-full', recording ? 'bg-destructive' : 'bg-muted-foreground')} />
            {recording ? 'Recording' : 'Record'}
          </TooltipTrigger>
          <TooltipContent>
            {recording
              ? 'Click nodes to add steps. Shift-click to reach a node at the same time. Press Esc to stop.'
              : 'Add steps by clicking nodes'}
          </TooltipContent>
        </Tooltip>
        {flow && selectedNodes === 1 && !recording && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const node = useDoc.getState().nodes.find((candidate) => candidate.selected)
              if (node) appendNodeToFlow(node.id)
            }}
          >
            <Plus /> Add selected
          </Button>
        )}
        <Segmented
          value={view}
          onChange={(flowView) => setUi({ flowView })}
          options={[
            { value: 'steps', label: 'Log' },
            { value: 'sequence', label: 'Sequence' },
            { value: 'timeline', label: 'Timeline' },
          ]}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close flows"
          onClick={() => setUi({ flowPanelOpen: false, recording: false })}
        >
          <X />
        </Button>
      </div>
      {!flow ? (
        <div className="m-2 flex flex-1 flex-wrap items-center justify-center gap-3 rounded-md border border-dashed px-4 text-sm text-muted-foreground">
          <Waypoints className="size-4" />
          A flow plays one request through your diagram, hop by hop.
          <Button
            size="sm"
            onClick={() => {
              const created = addFlow()
              setUi({ activeFlowId: created.id, recording: true })
            }}
          >
            <Plus /> New flow
          </Button>
          <Button size="sm" variant="outline" onClick={() => setUi({ traceImportOpen: true })}>
            <FileInput /> Import a trace
          </Button>
        </div>
      ) : view === 'steps' ? (
        <LogTable flow={flow} />
      ) : view === 'sequence' ? (
        <SequenceView flow={flow} />
      ) : (
        <div className="min-h-0 flex-1 p-2">
          <Timeline flow={flow} />
        </div>
      )}
    </section>
  )
}
