import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { edgeTravel, restingNodes, type EdgeEnds } from '@/engine/flow/compile'
import { findSegment } from '@/engine/flow/sides'
import { usePlaybackState } from '@/engine/hooks'
import { findStep, overviewName, removeStep } from '@/model/flow'
import { nodeTitle } from '@/model/labels'
import { payloadJson } from '@/model/payload'
import { MAX_LANE_DELAY_MS, type Flow, type Step, type Target } from '@/model/schema'
import { updateFlow } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { setUi } from '@/store/ui-store'
import { targetName } from '@/editor/flow/names'
import { deleteSelectedSteps } from '@/editor/flow/step-selection'
import { IS_MAC } from '@/lib/shortcut-keys'
import { Field, Section, Segmented, SliderField, SwitchField, TextInput } from './controls'

function StepBody({ flow, step }: { flow: Flow; step: Step }) {
  const playback = usePlaybackState()
  const edge = useDoc((state) => state.edges.find((candidate) => candidate.id === step.target.id))
  const reversed = (playback.timeline && findSegment(playback.timeline, step.id)?.segment.reversed) ?? false
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

function secondsText(delayMs: number): string {
  return delayMs > 0 ? String(delayMs / 1000) : ''
}

function parseDelayMs(text: string): number | undefined {
  const seconds = Number.parseFloat(text.replace(',', '.'))
  if (Number.isNaN(seconds)) return undefined
  const delayMs = Math.round(Math.min(MAX_LANE_DELAY_MS / 1000, Math.max(0, seconds)) * 1000)
  return delayMs > 0 ? delayMs : undefined
}

function DelayInput({
  name,
  delayMs,
  onChange,
}: {
  name: string
  delayMs: number
  onChange: (delayMs: number | undefined) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <div className="flex items-center justify-between gap-2 pl-3 text-xs text-muted-foreground">
      <span>Arrives after</span>
      <span className="flex items-center gap-1.5">
        <Input
          aria-label={`${name} arrives after, in seconds`}
          inputMode="decimal"
          spellCheck={false}
          placeholder="0"
          value={draft ?? secondsText(delayMs)}
          onChange={(event) => {
            setDraft(event.target.value)
            onChange(parseDelayMs(event.target.value))
          }}
          onBlur={() => setDraft(null)}
          className="h-7 w-16 px-2 py-0 text-right font-mono text-xs md:text-xs dark:bg-transparent"
        />
        s
      </span>
    </div>
  )
}

function ParallelTargets({ flow, step }: { flow: Flow; step: Step }) {
  const playback = usePlaybackState()
  const nodes = useDoc((state) => state.nodes)
  const edges = useDoc((state) => state.edges)
  const found = playback.timeline ? findSegment(playback.timeline, step.id) : null
  const segments = found?.view.segments ?? []
  const index = found?.index ?? -1
  const segment = found?.segment
  const before = index > 0 ? segments.slice(0, index).findLast((candidate) => candidate.lanes.length > 0) : undefined
  const resting = restingNodes(before?.lanes ?? [])
  const name = (id: string) => {
    const node = nodes.find((candidate) => candidate.id === id)
    return node ? nodeTitle(node) : 'Missing node'
  }
  const sharesEnd = (edge: EdgeEnds) => {
    if (!segment || edge.id === step.target.id) return false
    const travel = edgeTravel(edge, resting)
    return (
      travel.reversed === segment.reversed && (travel.fromNode === segment.fromNode || travel.toNode === segment.toNode)
    )
  }
  const candidates: Target[] =
    step.target.kind === 'edge'
      ? edges.filter(sharesEnd).map((edge) => ({ kind: 'edge', id: edge.id }))
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
    const travel = edgeTravel(edge, resting)
    return `${name(travel.fromNode)} → ${name(travel.toNode)}`
  }
  const toggle = (target: Target, on: boolean) =>
    updateFlow(flow.id, (draft) => {
      const place = findStep(draft, step.id)
      if (!place) return
      const rest = (place.step.parallel ?? []).filter((candidate) => !sameTarget(candidate, target))
      const next = on ? [...rest, { kind: target.kind, id: target.id }] : rest
      if (next.length > 0) place.step.parallel = next
      else {
        delete place.step.parallel
        delete place.step.delayMs
      }
    })
  const setDelay = (target: Target | null, delayMs: number | undefined) =>
    updateFlow(
      flow.id,
      (draft) => {
        const place = findStep(draft, step.id)
        const owner = target
          ? place?.step.parallel?.find((candidate) => sameTarget(candidate, target))
          : (place?.step ?? null)
        if (!owner) return
        if (delayMs === undefined) delete owner.delayMs
        else owner.delayMs = delayMs
      },
      `delay:${step.id}:${target ? `${target.kind}:${target.id}` : 'main'}`,
    )
  const main = step.target.kind === 'flow' ? null : step.target
  const showsDelays = (step.parallel?.length ?? 0) > 0 || (step.delayMs ?? 0) > 0

  return (
    <div className="space-y-1.5">
      <span className="text-xs text-muted-foreground">At the same time</span>
      {main && showsDelays && (
        <>
          <p className="text-xs text-muted-foreground">
            A token with a delay waits on its node. The next step starts when the last token arrives.
          </p>
          <p className="truncate text-xs text-muted-foreground">{label(main)}</p>
          <DelayInput name={label(main)} delayMs={step.delayMs ?? 0} onChange={(delayMs) => setDelay(null, delayMs)} />
        </>
      )}
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {step.target.kind === 'edge'
            ? 'No other connection leaves or reaches the same node in this direction.'
            : 'While you record, Shift-click a node to reach it at the same time as this one.'}
        </p>
      ) : (
        options.map((target) => {
          const chosen = step.parallel?.find((candidate) => sameTarget(candidate, target))
          return (
            <Fragment key={`${target.kind}:${target.id}`}>
              <SwitchField label={label(target)} checked={chosen !== undefined} onChange={(on) => toggle(target, on)} />
              {chosen && (
                <DelayInput
                  name={label(target)}
                  delayMs={chosen.delayMs ?? 0}
                  onChange={(delayMs) => setDelay(target, delayMs)}
                />
              )}
            </Fragment>
          )
        })
      )}
    </div>
  )
}

export function StepsInspector({ count }: { count: number }) {
  return (
    <Section title="Selection">
      <p className="text-xs text-muted-foreground">
        Shift-click a step to select a range. {IS_MAC ? 'Command-click' : 'Ctrl-click'} a step to add or remove it.
      </p>
      <Button variant="outline" size="sm" className="w-full" onClick={deleteSelectedSteps}>
        <Trash2 /> Delete {count} steps
      </Button>
    </Section>
  )
}

export function StepInspector({ flow, step }: { flow: Flow; step: Step }) {
  const place = findStep(flow, step.id)
  const index = place?.index ?? 0
  const count = place?.list.length ?? 0
  const overview = step.target.kind === 'flow'
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
              setUi({ selectedStepIds: [] })
            }}
          >
            <Trash2 />
          </Button>
        </div>
      }
    >
      <p className="truncate text-sm font-medium">
        {step.target.kind === 'flow' ? overviewName(index, count) : targetName(step.target)}
      </p>
      {overview && <p className="text-xs text-muted-foreground">Shows the whole path of the flow.</p>}
      <Field label="Event">
        <TextInput
          mono
          value={step.event}
          placeholder={step.target.kind === 'edge' ? 'The connection label' : 'POST /orders'}
          onChange={(event) => set({ event }, `event:${step.id}`)}
        />
      </Field>
      {!overview && (
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
      )}
      {step.target.kind === 'edge' && <StepBody flow={flow} step={step} />}
      {!overview && <ParallelTargets key={step.id} flow={flow} step={step} />}
      {!overview && (
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
      )}
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
      {!overview && (
        <Field label="Camera">
          <Segmented
            value={step.camera}
            onChange={(camera) => set({ camera })}
            options={[
              { value: 'follow', label: 'Auto', title: 'The camera of the flow keeps the step in view.' },
              { value: 'fit', label: 'Frame', title: 'The camera centres on the step and zooms in.' },
              { value: 'hold', label: 'Hold', title: 'The camera does not move.' },
            ]}
          />
        </Field>
      )}
      {(overview || step.camera !== 'hold') && (
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
