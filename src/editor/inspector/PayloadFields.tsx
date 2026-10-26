import { ArrowDown, ArrowUp, Braces, ChevronDown, ChevronRight, Copy, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { defaultPayloadField } from '@/model/defaults'
import {
  fieldIssues,
  fieldsFromJsonText,
  mergeFields,
  parsePath,
  PayloadJsonError,
  payloadJson,
  type PayloadPart,
} from '@/model/payload'
import { PAYLOAD_TYPES, type PayloadField, type PayloadType } from '@/model/schema'
import type { DiagramEdge } from '@/model/types'
import { setEdgePayload } from '@/store/actions'
import { Choice, Field, Section, SwitchField, TextInput } from './controls'

const PART_TITLES: Record<PayloadPart, string> = { request: 'Request body', response: 'Response body' }

const TYPE_LABELS: Record<PayloadType, string> = {
  string: 'String',
  number: 'Number',
  boolean: 'Boolean',
  object: 'Object',
  array: 'Array',
  null: 'Null',
}

const TYPE_OPTIONS = PAYLOAD_TYPES.map((value) => ({ value, label: TYPE_LABELS[value] }))

const EXAMPLE_PLACEHOLDERS: Partial<Record<PayloadType, string>> = { string: 'A-1', number: '2', boolean: 'true' }

const DEPTH_INDENT_PX = 12

function hasExample(type: PayloadType) {
  return type === 'string' || type === 'number' || type === 'boolean'
}

function depthOf(field: PayloadField) {
  return Math.max(0, (parsePath(field.path)?.length ?? 1) - 1)
}

function copyJson(text: string, part: PayloadPart) {
  void navigator.clipboard.writeText(text).then(
    () => toast.success(`Copied the example ${part} body`),
    () => toast.error('Could not copy. Open Edit as JSON, then select the text and copy it.'),
  )
}

function JsonDialog({
  open,
  onOpenChange,
  part,
  fields,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  part: PayloadPart
  fields: PayloadField[]
  onApply: (fields: PayloadField[]) => void
}) {
  const current = payloadJson({ fields }, 2)
  const [text, setText] = useState(current)
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()

  const apply = () => {
    try {
      onApply(mergeFields(fields, fieldsFromJsonText(text)))
      onOpenChange(false)
    } catch (caught) {
      if (!(caught instanceof PayloadJsonError)) throw caught
      setError(caught.message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{PART_TITLES[part]}</DialogTitle>
          <DialogDescription>
            Paste an example body to fill the fields. Fields with the same name keep their description.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          aria-label={`${PART_TITLES[part]} as JSON`}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          placeholder={'{\n  "sku": "LAMP-01",\n  "qty": 1\n}'}
          spellCheck={false}
          onChange={(event) => {
            setText(event.target.value)
            setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              apply()
            }
          }}
          className="h-64 resize-none font-mono text-xs leading-5 field-sizing-fixed [font-variant-ligatures:none] md:text-xs"
        />
        {error && (
          <p id={errorId} className="text-xs text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={!current} onClick={() => copyJson(current, part)}>
            <Copy /> Copy
          </Button>
          <Button onClick={apply} disabled={!text.trim()}>
            Use this JSON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FieldEditor({
  field,
  issue,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  field: PayloadField
  issue: string | undefined
  first: boolean
  last: boolean
  onChange: (patch: Partial<PayloadField>, key?: string) => void
  onMove: (delta: number) => void
  onRemove: () => void
}) {
  return (
    <div className="space-y-2 rounded-lg border bg-background/40 p-2">
      <Field label="Name" wide>
        <TextInput
          mono
          autoFocus={field.path === ''}
          value={field.path}
          placeholder="items[].sku"
          onChange={(path) => onChange({ path }, `payload-path:${field.id}`)}
        />
      </Field>
      {issue && (
        <p role="alert" className="text-xs text-warn">
          {issue}
        </p>
      )}
      <Field label="Type" wide>
        <Choice label="Type" value={field.type} onChange={(type) => onChange({ type })} options={TYPE_OPTIONS} />
      </Field>
      {hasExample(field.type) && (
        <Field label="Example" wide>
          <TextInput
            mono
            value={field.example}
            placeholder={EXAMPLE_PLACEHOLDERS[field.type]}
            onChange={(example) => onChange({ example }, `payload-example:${field.id}`)}
          />
        </Field>
      )}
      <Field label="Note" wide>
        <TextInput
          value={field.description}
          placeholder="What the field holds"
          onChange={(description) => onChange({ description }, `payload-description:${field.id}`)}
        />
      </Field>
      <SwitchField label="Required" checked={field.required} onChange={(required) => onChange({ required })} />
      <div className="flex justify-end gap-0.5">
        <Button variant="ghost" size="icon-xs" aria-label="Move field up" disabled={first} onClick={() => onMove(-1)}>
          <ArrowUp />
        </Button>
        <Button variant="ghost" size="icon-xs" aria-label="Move field down" disabled={last} onClick={() => onMove(1)}>
          <ArrowDown />
        </Button>
        <Button variant="ghost" size="icon-xs" aria-label="Remove field" onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}

function FieldRow({
  field,
  issue,
  open,
  onToggle,
}: {
  field: PayloadField
  issue: string | undefined
  open: boolean
  onToggle: () => void
}) {
  const Chevron = open ? ChevronDown : ChevronRight
  const name = field.path.trim() || 'Unnamed field'
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`${name}, ${TYPE_LABELS[field.type].toLowerCase()}${field.required ? '' : ', optional'}`}
      onClick={onToggle}
      className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md pr-1.5 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      style={{ paddingLeft: 4 + depthOf(field) * DEPTH_INDENT_PX }}
    >
      <Chevron className="size-3.5 shrink-0 text-muted-foreground" />
      <span className={cn('min-w-0 truncate font-mono', !field.path.trim() && 'text-muted-foreground')}>
        {name}
        {!field.required && <span className="text-muted-foreground">?</span>}
      </span>
      <span className="shrink-0 text-muted-foreground">{field.type}</span>
      {hasExample(field.type) && field.example && (
        <span className="min-w-0 flex-1 truncate text-right font-mono text-muted-foreground">{field.example}</span>
      )}
      {issue && <TriangleAlert aria-hidden className="ml-auto size-3.5 shrink-0 text-warn" />}
    </button>
  )
}

/** Edits the fields of the request or the response body of one edge. */
export function PayloadSection({ edge, part }: { edge: DiagramEdge; part: PayloadPart }) {
  const fields = edge.data?.[part]?.fields ?? []
  const [openId, setOpenId] = useState<string | null>(null)
  const [jsonOpen, setJsonOpen] = useState(false)
  const issues = fieldIssues(fields)
  const json = payloadJson({ fields }, 2)

  const setFields = (next: PayloadField[], key?: string) => setEdgePayload(edge.id, part, next, key)
  const change = (id: string, patch: Partial<PayloadField>, key?: string) =>
    setFields(
      fields.map((field) => (field.id === id ? { ...field, ...patch } : field)),
      key,
    )
  const move = (index: number, delta: number) => {
    const next = [...fields]
    const [moved] = next.splice(index, 1)
    if (moved) next.splice(index + delta, 0, moved)
    setFields(next)
  }
  const add = () => {
    const open = fields.find((field) => field.id === openId)
    const prefix =
      open?.type === 'object' ? `${open.path.trim()}.` : open?.type === 'array' ? `${open.path.trim()}[].` : ''
    const created = defaultPayloadField({ path: prefix })
    setFields([...fields, created])
    setOpenId(created.id)
  }

  return (
    <Section
      title={PART_TITLES[part]}
      action={
        <div className="flex">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Edit the ${part} body as JSON`}
            title="Edit as JSON"
            onClick={() => setJsonOpen(true)}
          >
            <Braces />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Copy the example ${part} body`}
            title="Copy example JSON"
            disabled={!json}
            onClick={() => copyJson(json, part)}
          >
            <Copy />
          </Button>
        </div>
      }
    >
      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {part === 'request'
            ? 'No fields. Add the fields that the source sends, or paste an example with Edit as JSON.'
            : 'No fields. Add the fields that come back, or paste an example with Edit as JSON.'}
        </p>
      ) : (
        <div className="space-y-0.5">
          {fields.map((field, index) => (
            <div key={field.id} className="space-y-1">
              <FieldRow
                field={field}
                issue={issues.get(field.id)}
                open={openId === field.id}
                onToggle={() => setOpenId(openId === field.id ? null : field.id)}
              />
              {openId === field.id && (
                <FieldEditor
                  field={field}
                  issue={issues.get(field.id)}
                  first={index === 0}
                  last={index === fields.length - 1}
                  onChange={(patch, key) => change(field.id, patch, key)}
                  onMove={(delta) => move(index, delta)}
                  onRemove={() => {
                    setFields(fields.filter((item) => item.id !== field.id))
                    setOpenId(null)
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}
      <Button variant="ghost" size="sm" className="justify-start" onClick={add}>
        <Plus /> Add a field
      </Button>
      {jsonOpen && (
        <JsonDialog open={jsonOpen} onOpenChange={setJsonOpen} part={part} fields={fields} onApply={setFields} />
      )}
    </Section>
  )
}
