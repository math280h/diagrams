import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { usePlaybackState } from '@/engine/hooks'
import { findStep, removeStep } from '@/model/flow'
import { nodeTitle } from '@/model/labels'
import { payloadJson } from '@/model/payload'
import type { Flow, Step, Target } from '@/model/schema'
import { updateFlow } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { setUi } from '@/store/ui-store'
import { targetName } from '@/editor/flow/names'
import { Field, Section, Segmented, SliderField, SwitchField, TextInput } from './controls'

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

function sameTarget(a: Target, b: Target) {
  return a.kind === b.kind && a.id === b.id
}

function ParallelTargets({ flow, step }: { flow: Flow; step: Step }) {
  const playback = usePlaybackState()
  const nodes = useDoc((state) => state.nodes)
  const edges = useDoc((state) => state.edges)
  const segments = playback.timeline?.segments ?? []
  const index = segments.findIndex((segment) => segment.step.id === step.id)
  const segment = segments[index]
  const name = (id: string) => {
    const node = nodes.find((candidate) => candidate.id === id)
    return node ? nodeTitle(node) : 'Missing node'
  }
  const from = segment?.fromNode ?? null
  const candidates: Target[] =
    step.target.kind === 'edge'
      ? edges
          .filter(
            (edge) => edge.id !== step.target.id && from && (segment?.reversed ? edge.target : edge.source) === from,
          )
          .map((edge) => ({ kind: 'edge', id: edge.id }))
      : (segments[index - 1]?.lanes ?? []).flatMap((lane): Target[] =>
          lane.target.kind === 'edge' && lane.toNode && lane.toNode !== step.target.id
            ? [{ kind: 'node', id: lane.toNode }]
            : [],
        )
  const options = [...(step.parallel ?? []), ...candidates].filter(
    (target, position, all) => all.findIndex((other) => sameTarget(other, target)) === position,
  )
  const label = (target: Target) => {
    if (target.kind === 'node') return name(target.id)
    const edge = edges.find((candidate) => candidate.id === target.id)
    if (!edge) return 'Missing connection'
    const start = from && edge.target === from ? edge.target : edge.source
    return `${name(start)} → ${name(start === edge.source ? edge.target : edge.source)}`
  }
  const toggle = (target: Target, on: boolean) =>
    updateFlow(flow.id, (draft) => {
      const place = findStep(draft, step.id)
      if (!place) return
      const rest = (place.step.parallel ?? []).filter((candidate) => !sameTarget(candidate, target))
      const next = on ? [...rest, target] : rest
      if (next.length > 0) place.step.parallel = next
      else delete place.step.parallel
    })

  return (
    <div className="space-y-1.5">
      <span className="text-xs text-muted-foreground">At the same time</span>
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {step.target.kind === 'edge'
            ? 'No other connection leaves the same node in this direction.'
            : 'While you record, Shift-click a node to reach it at the same time as this one.'}
        </p>
      ) : (
        options.map((target) => (
          <SwitchField
            key={`${target.kind}:${target.id}`}
            label={label(target)}
            checked={step.parallel?.some((candidate) => sameTarget(candidate, target)) ?? false}
            onChange={(on) => toggle(target, on)}
          />
        ))
      )}
    </div>
  )
}

export function StepInspector({ flow, step }: { flow: Flow; step: Step }) {
  const place = findStep(flow, step.id)
  const index = place?.index ?? 0
  const count = place?.list.length ?? 0
  const set = (patch: Partial<Step>, key?: string) =>
    updateFlow(
      flow.id,
      (draft) => {
        const target = findStep(draft, step.id)?.step
        if (target) Object.assign(target, patch)
      },
      key,
    )
  const move = (delta: number) =>
    updateFlow(flow.id, (draft) => {
      const list = findStep(draft, step.id)?.list
      if (!list) return
      const [item] = list.splice(index, 1)
      if (item) list.splice(index + delta, 0, item)
    })

  return (
    <Section
      title={place?.path ? `${place.path.name}: ${index + 1} of ${count}` : `${index + 1} of ${count}`}
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
            disabled={index === count - 1}
            onClick={() => move(1)}
          >
            <ArrowDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Delete step"
            onClick={() => {
              updateFlow(flow.id, (draft) => removeStep(draft, step.id))
              setUi({ selectedStepId: null })
            }}
          >
            <Trash2 />
          </Button>
        </div>
      }
    >
      <p className="truncate text-sm font-medium">{targetName(step.target)}</p>
      <Field label="Event">
        <TextInput
          mono
          value={step.event}
          placeholder={step.target.kind === 'edge' ? 'The connection label' : 'POST /orders'}
          onChange={(event) => set({ event }, `event:${step.id}`)}
        />
      </Field>
      <Field label="Latency">
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
      <ParallelTargets flow={flow} step={step} />
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
      <Field label="Caption">
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
            { value: 'follow', label: 'Auto', title: 'The camera keeps the step in view and moves only when it must.' },
            { value: 'fit', label: 'Frame', title: 'The camera centres on the step and zooms in.' },
            { value: 'hold', label: 'Hold', title: 'The camera does not move.' },
          ]}
        />
      </Field>
      {step.camera !== 'hold' && (
        <SliderField
          label="Max zoom"
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
