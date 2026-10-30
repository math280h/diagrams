import { createContext, use, useId, type ReactNode } from 'react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { swatchColor } from '@/canvas/canvas-theme'
import { cn } from '@/lib/utils'
import { COLOR_NAMES, COLORS, type Color } from '@/model/colors'
import { useHighContrast, useResolvedAppTheme } from '@/store/settings-store'

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-b border-panel-border px-3 py-3 last:border-b-0">
      <div className="mb-2.5 flex h-5 items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        {action}
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

const FieldLabelContext = createContext<string | undefined>(undefined)

/**
 * Puts a label beside a control.
 *
 * @param multiline - If true, the label lines up with the first line of a control that grows downwards.
 */
export function Field({ label, children, multiline }: { label: string; children: ReactNode; multiline?: boolean }) {
  const labelId = useId()
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('grid min-h-7 grid-cols-[72px_minmax(0,1fr)] gap-2', multiline ? 'items-start' : 'items-center')}
    >
      <span id={labelId} className={cn('truncate text-xs text-muted-foreground', multiline && 'leading-7')}>
        {label}
      </span>
      <div className="min-w-0">
        <FieldLabelContext value={labelId}>{children}</FieldLabelContext>
      </div>
    </div>
  )
}

export interface ChoiceOption<T extends string> {
  value: T
  label: string
}

export interface ChoiceGroup<T extends string> {
  label: string
  options: ChoiceOption<T>[]
}

export function Choice<T extends string>({
  value,
  onChange,
  options = [],
  groups,
  label,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options?: ChoiceOption<T>[]
  groups?: ChoiceGroup<T>[]
  label?: string
  className?: string
}) {
  const items = groups ? groups.flatMap((group) => group.options) : options
  const selected = items.find((option) => option.value === value)?.label
  const labelId = use(FieldLabelContext)
  const renderItem = (option: ChoiceOption<T>) => (
    <SelectItem key={option.value} value={option.value} className="text-xs">
      {option.label}
    </SelectItem>
  )
  return (
    <Select<T> value={value} onValueChange={(next) => next !== null && onChange(next)} items={items}>
      <SelectTrigger
        size="sm"
        aria-label={label}
        aria-labelledby={label ? undefined : labelId}
        title={selected}
        className={cn('w-full min-w-0 rounded-lg px-2 text-xs', className)}
      >
        <SelectValue className="min-w-0">{() => <span className="min-w-0 truncate">{selected}</span>}</SelectValue>
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false} className="max-h-80">
        {groups
          ? groups.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.options.map(renderItem)}
              </SelectGroup>
            ))
          : items.map(renderItem)}
      </SelectContent>
    </Select>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  mono,
  autoFocus,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  mono?: boolean
  autoFocus?: boolean
  className?: string
}) {
  const labelId = use(FieldLabelContext)
  return (
    <Input
      value={value}
      aria-labelledby={labelId}
      placeholder={placeholder}
      autoFocus={autoFocus}
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      className={cn('h-7 px-2 py-0 text-xs md:text-xs dark:bg-transparent', mono && 'font-mono', className)}
    />
  )
}

/** Edits text with line breaks. It grows with its lines, and Enter starts a new line. */
export function TextLines({
  value,
  onChange,
  onBlur,
  placeholder,
  mono,
}: {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  mono?: boolean
}) {
  const labelId = use(FieldLabelContext)
  return (
    <Textarea
      value={value}
      aria-labelledby={labelId}
      placeholder={placeholder}
      spellCheck={false}
      rows={Math.max(1, value.split('\n').length)}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      className={cn(
        'min-h-7 resize-none px-2 py-[5px] text-xs leading-4 md:text-xs dark:bg-transparent',
        mono && 'font-mono',
      )}
    />
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  /** The selected option. The value `null` selects no option, for example for mixed values. */
  value: T | null
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (value: T) => void
  label?: string
  className?: string
}) {
  const labelId = use(FieldLabelContext)
  return (
    <ToggleGroup
      aria-label={label}
      aria-labelledby={label ? undefined : labelId}
      value={value === null ? [] : [value]}
      onValueChange={(next) => {
        const picked = options.find((option) => option.value === next[0])
        if (picked) onChange(picked.value)
      }}
      className={cn('h-7 w-full gap-0 rounded-lg bg-muted p-0.5', className)}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          title={option.title}
          aria-label={typeof option.label === 'string' ? undefined : option.title}
          className="h-full min-w-7 flex-auto rounded-md px-2 text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-[0_0_0_1px_var(--border)] [&_svg:not([class*='size-'])]:size-3.5"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

const SWATCH_CLASS =
  'size-5 min-w-0 rounded-md border border-transparent p-0 hover:border-input hover:bg-transparent aria-pressed:border-foreground aria-pressed:bg-transparent'

function Swatches({
  value,
  onChange,
  children,
}: {
  value: string | null
  onChange: (value: string) => void
  children?: ReactNode
}) {
  const theme = useResolvedAppTheme()
  const highContrast = useHighContrast()
  return (
    <ToggleGroup
      aria-label="Colour"
      data-theme={theme}
      data-contrast={highContrast ? 'more' : undefined}
      value={value === null ? [] : [value]}
      onValueChange={(next) => {
        if (next[0] !== undefined) onChange(next[0])
      }}
      className="dg-zones flex-wrap gap-0.5"
    >
      {children}
      {COLORS.map((color) => (
        <ToggleGroupItem
          key={color}
          value={color}
          aria-label={COLOR_NAMES[color]}
          title={COLOR_NAMES[color]}
          className={SWATCH_CLASS}
        >
          <span className="size-3 rounded-full" style={{ background: swatchColor(color) }} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export function ColorPicker({
  value,
  onChange,
}: {
  /** The selected colour. The value `null` selects no colour, for example for mixed values. */
  value: Color | null
  onChange: (color: Color) => void
}) {
  return (
    <Swatches
      value={value}
      onChange={(next) => {
        const picked = COLORS.find((color) => color === next)
        if (picked) onChange(picked)
      }}
    />
  )
}

export function BoundaryColorPicker({
  value,
  kindColor,
  onChange,
}: {
  value: Color | 'auto'
  kindColor: Color
  onChange: (color: Color | 'auto') => void
}) {
  return (
    <Swatches
      value={value}
      onChange={(next) => {
        const picked = next === 'auto' ? next : COLORS.find((color) => color === next)
        if (picked) onChange(picked)
      }}
    >
      <ToggleGroupItem
        value="auto"
        title={`Auto (${COLOR_NAMES[kindColor].toLowerCase()})`}
        className="h-6 min-w-0 gap-1 rounded-md border border-input px-1.5 text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground aria-pressed:border-foreground aria-pressed:bg-transparent aria-pressed:text-foreground"
      >
        <span className="size-2.5 rounded-full" style={{ background: swatchColor(kindColor) }} />
        Auto
      </ToggleGroupItem>
    </Swatches>
  )
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (value: number) => string
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">{format ? format(value) : value}</span>
      </div>
      <Slider
        thumbLabel={label}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => onChange(Array.isArray(next) ? (next[0] ?? value) : next)}
      />
    </div>
  )
}

export function SwitchField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
