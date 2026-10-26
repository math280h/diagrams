import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { usePlaybackState } from '@/engine/hooks'
import { payloadJson } from '@/model/payload'
import type { Flow, Step } from '@/model/schema'
import { updateFlow } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { setUi } from '@/store/ui-store'
import { targetName } from '@/editor/flow/names'
import { Field, Section, Segmented, SliderField, TextInput } from './controls'

function StepBody({ flow, step }: { flow: Flow; step: Step }) {
  const playback = usePlaybackState()
  const edge = useDoc((state) => state.edges.find((candidate) => candidate.id === step.target.id))
  const reversed = playback.timeline?.segments.find((segment) => segment.step.id === step.id)?.reversed ?? false
  const part = reversed ? 'response' : 'request'
  const body = payloadJson(edge?.data?.[part], 2)
  const note = !flow.bodies
    ? 'The flow hides bodies. Turn them on in the flow options.'
    : body
      ? `The token moves ${reversed ? 'back' : 'forward'}, so the log shows the ${part} body.`
      : `The connection has no ${part} body. Add its fields on the connection.`
  return (
    <div className="space-y-1.5">
      <span className="text-xs text-muted-foreground">{reversed ? 'Response body' : 'Request body'}</span>
      {body && (
        <pre
          aria-label={`The ${part} body of the connection`}
          className="max-h-40 overflow-auto rounded-lg border bg-background/40 px-2 py-1.5 font-mono text-xs leading-5 text-muted-foreground [font-variant-ligatures:none]"
        >
          {body}
        </pre>
      )}
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  )
}

export function StepInspector({ flow, step }: { flow: Flow; step: Step }) {
  const index = flow.steps.findIndex((candidate) => candidate.id === step.id)
  const set = (patch: Partial<Step>, key?: string) =>
    updateFlow(
      flow.id,
      (draft) => {
        const target = draft.steps.find((candidate) => candidate.id === step.id)
        if (target) Object.assign(target, patch)
      },
      key,
    )
  const move = (delta: number) =>
    updateFlow(flow.id, (draft) => {
      const [item] = draft.steps.splice(index, 1)
      if (item) draft.steps.splice(index + delta, 0, item)
    })

  return (
    <Section
      title={`${index + 1} of ${flow.steps.length}`}
      action={
        <div className="flex">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Move earlier"
            disabled={index === 0}
            onClick={() => move(-1)}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Move later"
            disabled={index === flow.steps.length - 1}
            onClick={() => move(1)}
          >
            <ArrowDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Delete step"
            onClick={() => {
              updateFlow(flow.id, (draft) => {
                draft.steps = draft.steps.filter((candidate) => candidate.id !== step.id)
              })
              setUi({ selectedStepId: null })
            }}
          >
            <Trash2 />
          </Button>
        </div>
      }
    >
      <p className="truncate text-sm font-medium">{targetName(step.target)}</p>
      <Field label="Event" wide>
        <TextInput
          mono
          value={step.event}
          placeholder={step.target.kind === 'edge' ? 'The connection label' : 'POST /orders'}
          onChange={(event) => set({ event }, `event:${step.id}`)}
        />
      </Field>
      <Field label="Latency" wide>
        <TextInput
          mono
          value={step.latencyMs === null ? '' : String(step.latencyMs)}
          placeholder="ms"
          onChange={(text) => {
            const value = Number.parseFloat(text)
            set(
              { latencyMs: text.trim() === '' || Number.isNaN(value) ? null : Math.max(0, value) },
              `latency:${step.id}`,
            )
          }}
        />
      </Field>
      {step.target.kind === 'edge' && <StepBody flow={flow} step={step} />}
      <Field label="Level">
        <Segmented
          value={step.level}
          onChange={(level) => set({ level })}
          options={[
            { value: 'info', label: 'Info' },
            { value: 'warn', label: 'Warn' },
            { value: 'error', label: 'Error' },
          ]}
        />
      </Field>
      <Field label="Caption" wide>
        <Textarea
          value={step.caption}
          placeholder="What happens in this step"
          onChange={(event) => set({ caption: event.target.value }, `caption:${step.id}`)}
          className="min-h-16 text-xs"
        />
      </Field>
      <SliderField
        label="Duration"
        value={step.durationMs}
        min={200}
        max={8000}
        step={100}
        format={(value) => `${(value / 1000).toFixed(1)} s`}
        onChange={(durationMs) => set({ durationMs }, `duration:${step.id}`)}
      />
      <Field label="Camera">
        <Segmented
          value={step.camera}
          onChange={(camera) => set({ camera })}
          options={[
            { value: 'follow', label: 'Follow', title: 'The camera follows the token.' },
            { value: 'fit', label: 'Frame', title: 'The camera frames the step target.' },
            { value: 'hold', label: 'Hold', title: 'The camera does not move.' },
          ]}
        />
      </Field>
      {step.camera !== 'hold' && (
        <SliderField
          label={step.camera === 'fit' ? 'Max zoom' : 'Zoom'}
          value={step.zoom}
          min={0.2}
          max={2.5}
          step={0.05}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(zoom) => set({ zoom }, `zoom:${step.id}`)}
        />
      )}
    </Section>
  )
}
