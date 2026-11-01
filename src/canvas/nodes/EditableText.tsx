import { useState, type CSSProperties, type KeyboardEvent } from 'react'

interface EditableTextProps {
  value: string
  editable: boolean
  onCommit: (value: string) => void
  className?: string
  style?: CSSProperties
  multiline?: boolean
  placeholder?: string
}

/**
 * Shows a text that a double click edits when `editable` is true. An empty text shows the placeholder. When `editable` is
 * false, the placeholder is invisible but keeps its space.
 */
export function EditableText({
  value,
  editable,
  onCommit,
  className,
  style,
  multiline,
  placeholder,
}: EditableTextProps) {
  const [draft, setDraft] = useState<string | null>(null)

  if (draft === null) {
    return (
      <span className={className} style={style} onDoubleClick={editable ? () => setDraft(value) : undefined}>
        {value || (
          <span style={{ color: 'var(--dg-faint)', visibility: editable ? undefined : 'hidden' }}>{placeholder}</span>
        )}
      </span>
    )
  }

  const commit = () => {
    if (draft !== value) onCommit(draft)
    setDraft(null)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    event.stopPropagation()
    if (event.key === 'Escape') setDraft(null)
    if (event.key === 'Enter' && (!multiline || event.metaKey || event.ctrlKey)) commit()
  }
  const common = {
    autoFocus: true,
    value: draft,
    onBlur: commit,
    onKeyDown,
    className: `${className ?? ''} dg-inline-edit nodrag nopan nowheel`,
    style,
    onFocus: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => event.currentTarget.select(),
  }
  return multiline ? (
    <textarea
      {...common}
      rows={Math.max(1, draft.split('\n').length)}
      onChange={(event) => setDraft(event.target.value)}
    />
  ) : (
    <input {...common} onChange={(event) => setDraft(event.target.value)} />
  )
}
