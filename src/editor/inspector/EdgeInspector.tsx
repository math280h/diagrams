import { ArrowLeftRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { detectProtocol, PROTOCOL_LABELS, PROTOCOLS } from '@/model/protocols'
import { SIDES, type EdgeData, type Side, type Traffic } from '@/model/schema'
import type { DiagramEdge } from '@/model/types'
import { reverseEdge, setEdgeSides, updateEdgesData, updateEdgesTraffic } from '@/store/actions'
import { Choice, Field, Section, Segmented, SliderField, SwitchField, TextInput } from './controls'
import { PayloadSection } from './PayloadFields'

const MARKER_OPTIONS = [
  { value: 'none' as const, label: 'None' },
  { value: 'arrow' as const, label: 'Arrow' },
  { value: 'dot' as const, label: 'Dot' },
]

export function TrafficFields({
  traffic,
  onChange,
}: {
  traffic: Traffic
  onChange: (patch: Partial<Traffic>, key?: string) => void
}) {
  return (
    <>
      <SwitchField label="Animate traffic" checked={traffic.enabled} onChange={(enabled) => onChange({ enabled })} />
      {traffic.enabled && (
        <>
          <Field label="Style">
            <Segmented
              value={traffic.style}
              onChange={(style) => onChange({ style })}
              options={[
                { value: 'dots', label: 'Dots' },
                { value: 'comets', label: 'Comets' },
                { value: 'dashes', label: 'Dashes' },
                { value: 'pulse', label: 'Pulse' },
              ]}
            />
          </Field>
          <Field label="Direction">
            <Segmented
              value={traffic.direction}
              onChange={(direction) => onChange({ direction })}
              options={[
                { value: 'forward', label: 'Forward' },
                { value: 'reverse', label: 'Back' },
                { value: 'both', label: 'Both' },
              ]}
            />
          </Field>
          <SliderField
            label="Speed"
            value={traffic.speed}
            min={10}
            max={600}
            step={5}
            format={(value) => `${value} px/s`}
            onChange={(speed) => onChange({ speed }, 'traffic-speed')}
          />
          {(traffic.style === 'dots' || traffic.style === 'comets' || traffic.style === 'dashes') && (
            <SliderField
              label="Density"
              value={traffic.density}
              min={0.2}
              max={8}
              step={0.1}
              format={(value) => `${value.toFixed(1)} / 100 px`}
              onChange={(density) => onChange({ density }, 'traffic-density')}
            />
          )}
          <SliderField
            label="Size"
            value={traffic.size}
            min={0.6}
            max={5}
            step={0.1}
            format={(value) => value.toFixed(1)}
            onChange={(size) => onChange({ size }, 'traffic-size')}
          />
        </>
      )}
    </>
  )
}

function autoProtocolLabel(label: string): string {
  const detected = detectProtocol(label)
  return detected ? `From the label (${PROTOCOL_LABELS[detected]})` : 'From the label (none)'
}

export function EdgeInspector({ edges }: { edges: DiagramEdge[] }) {
  const first = edges[0]
  if (!first?.data) return null
  const data = first.data
  const ids = new Set(edges.map((edge) => edge.id))
  const single = edges.length === 1
  const set = (patch: Partial<EdgeData>, key?: string) => updateEdgesData(ids, patch, key)
  const setTraffic = (patch: Partial<Traffic>, key?: string) => updateEdgesTraffic(ids, patch, key)

  return (
    <>
      <Section
        title="Line"
        action={
          single && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Reverse direction"
              title="Reverse direction"
              onClick={() => reverseEdge(first.id)}
            >
              <ArrowLeftRight />
            </Button>
          )
        }
      >
        {single && (
          <>
            <Field label="Label" wide>
              <TextInput
                mono
                value={data.label}
                placeholder="8.4k/s"
                onChange={(label) => set({ label }, `edge-label:${first.id}`)}
              />
            </Field>
            {data.label && (
              <SliderField
                label="Label position"
                value={Math.round(data.labelPosition * 100)}
                min={0}
                max={100}
                step={1}
                format={(value) => `${value}%`}
                onChange={(value) => set({ labelPosition: value / 100 }, 'label-position')}
              />
            )}
          </>
        )}
        <Field label="Protocol" wide>
          <Choice
            label="Protocol"
            value={data.protocol}
            onChange={(protocol) => set({ protocol })}
            options={[
              { value: 'auto', label: autoProtocolLabel(data.label) },
              ...PROTOCOLS.map((value) => ({ value, label: PROTOCOL_LABELS[value] })),
              { value: 'none', label: 'None' },
            ]}
          />
        </Field>
        <Field label="Path">
          <Segmented
            value={data.path}
            onChange={(path) => set({ path })}
            options={[
              { value: 'bezier', label: 'Curve' },
              { value: 'smooth', label: 'Round' },
              { value: 'step', label: 'Step' },
              { value: 'straight', label: 'Line' },
            ]}
          />
        </Field>
        <Field label="Stroke">
          <Segmented
            value={data.stroke}
            onChange={(stroke) => set({ stroke })}
            options={[
              { value: 'solid', label: 'Solid' },
              { value: 'dashed', label: 'Dashed' },
              { value: 'dotted', label: 'Dotted' },
            ]}
          />
        </Field>
        <SliderField
          label="Width"
          value={data.width}
          min={0.5}
          max={6}
          step={0.25}
          onChange={(width) => set({ width }, 'edge-width')}
        />
      </Section>
      {single && (
        <>
          <PayloadSection key={`request:${first.id}`} edge={first} part="request" />
          <PayloadSection key={`response:${first.id}`} edge={first} part="response" />
        </>
      )}
      <Section title="Ends">
        <Field label="Start">
          <Segmented
            value={data.markerStart}
            onChange={(markerStart) => set({ markerStart })}
            options={MARKER_OPTIONS}
          />
        </Field>
        <Field label="End">
          <Segmented value={data.markerEnd} onChange={(markerEnd) => set({ markerEnd })} options={MARKER_OPTIONS} />
        </Field>
        <SwitchField label="Mark the ends" checked={data.ports} onChange={(ports) => set({ ports })} />
        {single && (
          <>
            <Field label="Sides">
              <Segmented
                value={data.sides}
                onChange={(sides) => {
                  if (sides === 'fixed' && (!first.sourceHandle || !first.targetHandle))
                    setEdgeSides(first.id, first.sourceHandle ?? 'right', first.targetHandle ?? 'left')
                  set({ sides })
                }}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'fixed', label: 'Fixed' },
                ]}
              />
            </Field>
            {data.sides === 'fixed' && (
              <div className="grid grid-cols-2 gap-2">
                {(['sourceHandle', 'targetHandle'] as const).map((key) => (
                  <div key={key} className="space-y-1">
                    <span className="text-xs text-muted-foreground">
                      {key === 'sourceHandle' ? 'From side' : 'To side'}
                    </span>
                    <Choice
                      label={key === 'sourceHandle' ? 'From side' : 'To side'}
                      value={(first[key] ?? (key === 'sourceHandle' ? 'right' : 'left')) as Side}
                      onChange={(side) =>
                        key === 'sourceHandle'
                          ? setEdgeSides(first.id, side, first.targetHandle ?? 'left')
                          : setEdgeSides(first.id, first.sourceHandle ?? 'right', side)
                      }
                      options={SIDES.map((side) => ({
                        value: side,
                        label: side.charAt(0).toUpperCase() + side.slice(1),
                      }))}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Section>
      <Section title="Traffic">
        <TrafficFields traffic={data.traffic} onChange={setTraffic} />
      </Section>
    </>
  )
}
