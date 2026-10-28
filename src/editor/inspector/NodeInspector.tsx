import { AlignCenter, AlignLeft, AlignRight, Plus, X } from 'lucide-react'
import { Icon } from '@/canvas/icon'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { newId } from '@/model/defaults'
import { BOUNDARY_KINDS, BOUNDARY_PROVIDERS, boundaryKind, boundaryKindLabel } from '@/model/boundaries'
import { CARD_FORM_LABELS, PRESET_BY_ID } from '@/model/presets'
import { CARD_FORMS, SHAPES, type CardData, type GroupData, type ShapeData, type TextData } from '@/model/schema'
import type { CardNodeType, DiagramNode, GroupNodeType, ShapeNodeType, TextNodeType } from '@/model/types'
import { pinNodes, updateNodeData } from '@/store/actions'
import { useState } from 'react'
import {
  BoundaryColorPicker,
  Choice,
  ColorPicker,
  Field,
  Section,
  Segmented,
  SliderField,
  SwitchField,
  TextInput,
} from './controls'
import { DetailsFields } from './DetailsFields'
import { OpensFields } from './OpensFields'
import { IconPicker } from './IconPicker'
import { NodeLinks } from './NodeLinks'

const FORM_OPTIONS = CARD_FORMS.map((value) => ({ value, label: CARD_FORM_LABELS[value] }))

const SHAPE_OPTIONS = SHAPES.map((shape) => {
  const preset = PRESET_BY_ID.get(shape)
  return { shape, label: preset?.label ?? shape, icon: preset?.icon ?? 'square' }
})

function CardFields({ node }: { node: CardNodeType }) {
  const { data } = node
  const set = (patch: Partial<CardData>, key?: string) => updateNodeData(node.id, patch, key)
  const [detail, ...extraLines] = data.lines
  const hasExtras = extraLines.length > 0 || data.meter !== null || data.status !== 'none' || data.badge !== ''
  const [extrasOpen, setExtrasOpen] = useState(hasExtras)

  const setDetail = (text: string) => {
    const first = { id: detail?.id ?? newId('l'), text }
    set({ lines: text === '' && extraLines.length === 0 ? [] : [first, ...extraLines] }, `detail:${node.id}`)
  }

  return (
    <>
      <Section title="Content">
        <Field label="Name" wide>
          <TextInput value={data.title} onChange={(title) => set({ title }, `title:${node.id}`)} />
        </Field>
        <Field label="Kind" wide>
          <Choice label="Kind" value={data.form} onChange={(form) => set({ form })} options={FORM_OPTIONS} />
        </Field>
        <Field label="Detail" wide>
          <TextInput mono value={detail?.text ?? ''} placeholder="Go, 3 replicas" onChange={setDetail} />
        </Field>
        <Field label="Icon" wide>
          <IconPicker value={data.icon} onChange={(icon) => set({ icon })} allowNone />
        </Field>
        <Field label="Colour" wide>
          <ColorPicker value={data.color} onChange={(color) => set({ color })} />
        </Field>
      </Section>
      <Section title="Metrics">
        <SwitchField label="Edit metrics" checked={extrasOpen} onChange={setExtrasOpen} />
        {extrasOpen && (
          <>
            {extraLines.map((line) => (
              <div key={line.id} className="flex items-center gap-1">
                <TextInput
                  mono
                  value={line.text}
                  onChange={(text) =>
                    set(
                      { lines: data.lines.map((item) => (item.id === line.id ? { ...item, text } : item)) },
                      `line:${line.id}`,
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Remove line"
                  onClick={() => set({ lines: data.lines.filter((item) => item.id !== line.id) })}
                >
                  <X />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() =>
                set({
                  lines: [
                    ...(detail ? data.lines : [{ id: newId('l'), text: '' }]),
                    { id: newId('l'), text: 'p99 {840} ms' },
                  ],
                })
              }
            >
              <Plus /> Add a metric line
            </Button>
            <p className="text-xs text-muted-foreground">
              Text in braces, for example <code className="font-mono">{'{840}'}</code>, shows brighter.
            </p>
            <SwitchField
              label="Meter"
              checked={data.meter !== null}
              onChange={(on) => set({ meter: on ? 0.5 : null })}
            />
            {data.meter !== null && (
              <>
                <SliderField
                  label="Value"
                  value={Math.round(data.meter * 100)}
                  min={0}
                  max={100}
                  step={1}
                  format={(value) => `${value}%`}
                  onChange={(value) => set({ meter: value / 100 }, `meter:${node.id}`)}
                />
                <Field label="Meter text">
                  <TextInput
                    mono
                    value={data.meterText}
                    placeholder="auto"
                    onChange={(meterText) => set({ meterText }, `meter-text:${node.id}`)}
                    className="w-28"
                  />
                </Field>
              </>
            )}
            <Field label="Status">
              <Segmented
                value={data.status}
                onChange={(status) => set({ status })}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'ok', label: 'OK' },
                  { value: 'warn', label: 'Warn' },
                  { value: 'error', label: 'Error' },
                ]}
              />
            </Field>
            <Field label="Badge">
              <TextInput
                value={data.badge}
                placeholder="v2"
                onChange={(badge) => set({ badge }, `badge:${node.id}`)}
                className="w-28"
              />
            </Field>
          </>
        )}
      </Section>
    </>
  )
}

function ShapeFields({ node }: { node: ShapeNodeType }) {
  const { data } = node
  const set = (patch: Partial<ShapeData>, key?: string) => updateNodeData(node.id, patch, key)
  return (
    <Section title="Content">
      <Field label="Label" wide>
        <TextInput value={data.label} onChange={(label) => set({ label }, `label:${node.id}`)} />
      </Field>
      <Field label="Form" wide>
        <ToggleGroup
          value={[data.shape]}
          onValueChange={(next) => {
            const picked = SHAPES.find((shape) => shape === next[0])
            if (picked) set({ shape: picked })
          }}
          className="grid w-full grid-cols-4 gap-1"
        >
          {SHAPE_OPTIONS.map(({ shape, label, icon }) => (
            <ToggleGroupItem
              key={shape}
              value={shape}
              aria-label={label}
              title={label}
              className="h-7 w-full min-w-0 rounded-md px-0 text-muted-foreground hover:bg-accent/60 aria-pressed:bg-accent aria-pressed:text-foreground"
            >
              <Icon name={icon} className="size-3.5" />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <Field label="Icon" wide>
        <IconPicker value={data.icon} onChange={(icon) => set({ icon })} allowNone />
      </Field>
      <Field label="Fill">
        <Segmented
          value={data.fill}
          onChange={(fill) => set({ fill })}
          options={[
            { value: 'tint', label: 'Tint' },
            { value: 'solid', label: 'Solid' },
            { value: 'outline', label: 'Line' },
          ]}
        />
      </Field>
      <Field label="Colour" wide>
        <ColorPicker value={data.color} onChange={(color) => set({ color })} />
      </Field>
    </Section>
  )
}

function TextFields({ node }: { node: TextNodeType }) {
  const { data } = node
  const set = (patch: Partial<TextData>, key?: string) => updateNodeData(node.id, patch, key)
  return (
    <Section title="Content">
      <Textarea
        value={data.text}
        onChange={(event) => set({ text: event.target.value }, `text:${node.id}`)}
        className="min-h-20 text-xs"
      />
      <Field label="Size">
        <Segmented
          value={data.size}
          onChange={(size) => set({ size })}
          options={[
            { value: 'sm', label: 'S' },
            { value: 'md', label: 'M' },
            { value: 'lg', label: 'L' },
            { value: 'xl', label: 'XL' },
          ]}
        />
      </Field>
      <Field label="Tone">
        <Segmented
          value={data.tone}
          onChange={(tone) => set({ tone })}
          options={[
            { value: 'default', label: 'Normal' },
            { value: 'muted', label: 'Muted' },
          ]}
        />
      </Field>
      <Field label="Align">
        <Segmented
          value={data.align}
          onChange={(align) => set({ align })}
          options={[
            { value: 'left', label: <AlignLeft />, title: 'Left' },
            { value: 'center', label: <AlignCenter />, title: 'Centre' },
            { value: 'right', label: <AlignRight />, title: 'Right' },
          ]}
        />
      </Field>
      <SwitchField label="Monospace" checked={data.mono} onChange={(mono) => set({ mono })} />
    </Section>
  )
}

function KindSelect({ value, onChange }: { value: string; onChange: (kind: string) => void }) {
  const groups = BOUNDARY_PROVIDERS.map((provider) => ({
    label: provider.name,
    options: BOUNDARY_KINDS.filter((kind) => kind.provider === provider.id).map((kind) => ({
      value: kind.id,
      label: kind.tier === 'custom' ? 'Group (custom)' : boundaryKindLabel(kind),
    })),
  }))
  return <Choice label="Kind" value={value} onChange={onChange} groups={groups} />
}

function GroupFields({ node }: { node: GroupNodeType }) {
  const { data } = node
  const set = (patch: Partial<GroupData>, key?: string) => updateNodeData(node.id, patch, key)
  const kind = boundaryKind(data.kind)

  const changeKind = (id: string) => {
    const next = boundaryKind(id)
    const patch: Partial<GroupData> = { kind: next.id }
    if (data.icon === kind.icon) patch.icon = next.icon
    if (next.tier !== 'custom' && data.label === 'Group') patch.label = ''
    if (next.tier === 'custom' && data.label === '') patch.label = 'Group'
    set(patch)
  }

  return (
    <Section title="Boundary">
      <Field label="Kind" wide>
        <KindSelect value={kind.id} onChange={changeKind} />
      </Field>
      <Field label="Name" wide>
        <TextInput
          value={data.label}
          placeholder={kind.tier === 'custom' ? 'Group' : 'prod-payments'}
          onChange={(label) => set({ label }, `label:${node.id}`)}
        />
      </Field>
      <Field label="Detail" wide>
        <TextInput
          mono
          value={data.detail}
          placeholder={kind.detailHint || 'Optional'}
          onChange={(detail) => set({ detail }, `detail:${node.id}`)}
        />
      </Field>
      <Field label="Colour" wide>
        <BoundaryColorPicker value={data.color} kindColor={kind.color} onChange={(color) => set({ color })} />
      </Field>
      {kind.tier === 'custom' && (
        <Field label="Line">
          <Segmented
            value={data.border}
            onChange={(border) => set({ border })}
            options={[
              { value: 'dashed', label: 'Dashed' },
              { value: 'solid', label: 'Solid' },
              { value: 'none', label: 'None' },
            ]}
          />
        </Field>
      )}
      <Field label="Icon" wide>
        <IconPicker value={data.icon} onChange={(icon) => set({ icon })} allowNone />
      </Field>
      <SwitchField label="Tinted area" checked={data.tint} onChange={(tint) => set({ tint })} />
    </Section>
  )
}

function LayoutFields({ node }: { node: DiagramNode }) {
  return (
    <Section title="Layout">
      <SwitchField
        label="Pin position"
        checked={node.data.pinned === true}
        onChange={(pinned) => pinNodes([node.id], pinned)}
      />
      <p className="text-xs text-muted-foreground">Tidy up and agents keep a pinned node in its place.</p>
    </Section>
  )
}

function TypeFields({ node }: { node: DiagramNode }) {
  switch (node.type) {
    case 'card':
      return (
        <>
          <CardFields node={node} />
          <DetailsFields node={node} />
          <OpensFields node={node} />
          <NodeLinks node={node} />
        </>
      )
    case 'shape':
      return (
        <>
          <ShapeFields node={node} />
          <DetailsFields node={node} />
        </>
      )
    case 'text':
      return <TextFields node={node} />
    case 'group':
      return (
        <>
          <GroupFields node={node} />
          <DetailsFields node={node} />
          <OpensFields node={node} />
        </>
      )
  }
}

export function NodeInspector({ node }: { node: DiagramNode }) {
  return (
    <>
      <TypeFields node={node} />
      <LayoutFields node={node} />
    </>
  )
}
