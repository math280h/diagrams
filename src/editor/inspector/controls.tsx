import type { ReactNode } from 'react'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { BOUNDARY_COLORS, type BoundaryColor } from '@/model/boundaries'
import { useResolvedAppTheme } from '@/store/settings-store'

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

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div role="group" aria-label={label} className="grid min-h-7 grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <div className={cn('min-w-0', !wide && 'flex justify-end')}>{children}</div>
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
  const renderItem = (option: ChoiceOption<T>) => (
    <SelectItem key={option.value} value={option.value} className="text-xs">
      {option.label}
    </SelectItem>
  )
  return (
    <Select<T> value={value} onValueChange={(next) => next !== null && onChange(next)} items={items}>
      <SelectTrigger size="sm" aria-label={label} className={cn('w-full min-w-0 rounded-lg px-2 text-xs', className)}>
        <SelectValue />
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
  return (
    <Input
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      className={cn('h-7 px-2 py-0 text-xs md:text-xs dark:bg-transparent', mono && 'font-mono', className)}
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
  return (
    <ToggleGroup
      aria-label={label}
      value={value === null ? [] : [value]}
      onValueChange={(next) => {
        const picked = options.find((option) => option.value === next[0])
        if (picked) onChange(picked.value)
      }}
      className={cn('h-7 gap-0 rounded-lg bg-muted p-0.5', className)}
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

const COLOR_NAMES: Record<BoundaryColor, string> = {
  neutral: 'Neutral',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  teal: 'Teal',
  blue: 'Blue',
  pink: 'Pink',
  red: 'Red',
}

const COLOR_CHOICES: (BoundaryColor | 'auto')[] = ['auto', ...BOUNDARY_COLORS]

function swatch(color: BoundaryColor) {
  return color === 'neutral' ? 'var(--dg-line-strong)' : `var(--dg-zone-${color})`
}

export function BoundaryColorPicker({
  value,
  kindColor,
  onChange,
}: {
  value: BoundaryColor | 'auto'
  kindColor: BoundaryColor
  onChange: (color: BoundaryColor | 'auto') => void
}) {
  const theme = useResolvedAppTheme()
  return (
    <ToggleGroup
      aria-label="Colour"
      data-theme={theme}
      value={[value]}
      onValueChange={(next) => {
        const picked = COLOR_CHOICES.find((choice) => choice === next[0])
        if (picked) onChange(picked)
      }}
      className="dg-zones flex-wrap gap-1.5"
    >
      <ToggleGroupItem
        value="auto"
        title={`Auto (${COLOR_NAMES[kindColor].toLowerCase()})`}
        className="h-6 min-w-0 gap-1 rounded-md border border-input px-1.5 text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground aria-pressed:border-foreground aria-pressed:bg-transparent aria-pressed:text-foreground"
      >
        <span className="size-2.5 rounded-full" style={{ background: swatch(kindColor) }} />
        Auto
      </ToggleGroupItem>
      {BOUNDARY_COLORS.map((color) => (
        <ToggleGroupItem
          key={color}
          value={color}
          aria-label={COLOR_NAMES[color]}
          title={COLOR_NAMES[color]}
          className="size-6 min-w-0 rounded-md border border-transparent p-0 hover:border-input hover:bg-transparent aria-pressed:border-foreground aria-pressed:bg-transparent"
        >
          <span className="size-3 rounded-full" style={{ background: swatch(color) }} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
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
        <span className="text-foreground/80">{label}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">{format ? format(value) : value}</span>
      </div>
      <Slider
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
      <span className="text-xs text-foreground/80">{label}</span>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
