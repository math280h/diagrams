import { Search } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Icon } from '@/canvas/icon'
import { loadIconNames } from '@/canvas/icon-cache'
import { useIconTitle } from '@/canvas/icons/use-icon-title'
import {
  ICON_SOURCES,
  iconSourceOf,
  loadIconSets,
  searchIcons,
  type IconEntry,
  type IconSet,
  type IconSourceId,
} from '@/canvas/icons/library'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

const SYMBOL_PAGE = 240
const SEARCH_PAGE = 48

type PickerSource = 'symbols' | IconSourceId

const PICKER_SOURCES: { id: PickerSource; label: string }[] = [{ id: 'symbols', label: 'Symbols' }, ...ICON_SOURCES]

function symbolTitle(name: string): string {
  const words = name.replace(/-/g, ' ')
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}

function IconButton({
  name,
  title,
  selected,
  onChoose,
}: {
  name: string
  title: string
  selected: boolean
  onChoose: (name: string) => void
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      title={title}
      aria-label={title}
      aria-pressed={selected}
      onClick={() => onChoose(name)}
      className={cn('rounded-md hover:bg-accent', selected && 'bg-accent')}
    >
      <Icon name={name} className="size-[18px]" strokeWidth={1.75} />
    </Button>
  )
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-8 gap-0.5">{children}</div>
}

function Heading({ children }: { children: ReactNode }) {
  return <h4 className="px-1 pt-2 pb-1 text-xs font-medium text-muted-foreground first:pt-0">{children}</h4>
}

function groupBy<T>(items: T[], key: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const name = key(item)
    groups.set(name, [...(groups.get(name) ?? []), item])
  }
  return [...groups]
}

export function IconPicker({
  value,
  onChange,
  allowNone,
}: {
  value: string
  onChange: (icon: string) => void
  allowNone?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<PickerSource>(() => iconSourceOf(value) ?? 'symbols')
  const [symbolNames, setSymbolNames] = useState<readonly string[]>([])
  const [sets, setSets] = useState<IconSet[]>([])
  const setTitle = useIconTitle(value)
  const title = iconSourceOf(value) ? setTitle : symbolTitle(value)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void loadIconNames().then((names) => {
      if (!cancelled) setSymbolNames(names)
    })
    void loadIconSets().then((loaded) => {
      if (!cancelled) setSets(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  const text = query.trim().toLowerCase()
  const symbolMatches = useMemo(() => {
    const dashed = text.replace(/\s+/g, '-')
    const list = dashed ? symbolNames.filter((name) => name.includes(dashed)) : symbolNames
    return list.slice(0, dashed ? SEARCH_PAGE : SYMBOL_PAGE)
  }, [text, symbolNames])
  const setMatches = useMemo(() => (text ? searchIcons(sets, text, SEARCH_PAGE * 2) : []), [text, sets])
  const browsed = source === 'symbols' ? undefined : sets.find((set) => set.source === source)

  const choose = (name: string) => {
    onChange(name)
    setOpen(false)
  }
  const button = (entry: IconEntry) => (
    <IconButton key={entry.id} name={entry.id} title={entry.title} selected={entry.id === value} onChoose={choose} />
  )
  const symbolGrid = (names: readonly string[]) => (
    <Grid>
      {names.map((name) => (
        <IconButton key={name} name={name} title={symbolTitle(name)} selected={name === value} onChoose={choose} />
      ))}
    </Grid>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex h-7 w-full items-center gap-2 rounded-lg border border-input px-2 text-xs transition-colors hover:bg-accent">
        {value ? <Icon name={value} className="size-3.5" /> : <span className="size-3.5" />}
        <span className="truncate text-foreground/80">{value ? title : 'No icon'}</span>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <InputGroup className="h-9 rounded-none border-0 border-b dark:bg-transparent">
          <InputGroupAddon>
            <Search className="size-3.5" />
          </InputGroupAddon>
          <InputGroupInput
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search icons, cloud services and logos"
            aria-label="Search icons"
            className="text-xs md:text-xs"
          />
        </InputGroup>
        {!text && (
          <ToggleGroup
            aria-label="Icon source"
            value={[source]}
            onValueChange={(next) => {
              const picked = PICKER_SOURCES.find((item) => item.id === next[0])
              if (picked) setSource(picked.id)
            }}
            className="w-full flex-wrap gap-1 border-b px-2 py-1.5"
          >
            {PICKER_SOURCES.map((item) => (
              <ToggleGroupItem
                key={item.id}
                value={item.id}
                className="h-6 min-w-0 rounded-md px-2 text-[11px] font-normal text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:bg-accent aria-pressed:text-foreground"
              >
                {item.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        <div className="max-h-72 overflow-y-auto p-1.5">
          {allowNone && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => choose('')}
              className="mb-1 w-full justify-start rounded-md px-2 text-xs font-normal text-muted-foreground hover:bg-accent"
            >
              No icon
            </Button>
          )}
          {text ? (
            <>
              {groupBy(setMatches, (entry) => iconSourceOf(entry.id) ?? '').map(([id, entries]) => (
                <div key={id}>
                  <Heading>{ICON_SOURCES.find((item) => item.id === id)?.label}</Heading>
                  <Grid>{entries.map(button)}</Grid>
                </div>
              ))}
              {symbolMatches.length > 0 && (
                <div>
                  <Heading>Symbols</Heading>
                  {symbolGrid(symbolMatches)}
                </div>
              )}
              {setMatches.length === 0 && symbolMatches.length === 0 && (
                <p className="px-1 py-2 text-xs text-muted-foreground">Nothing matches your search.</p>
              )}
            </>
          ) : source === 'symbols' ? (
            <>
              {symbolGrid(symbolMatches)}
              {symbolMatches.length === SYMBOL_PAGE && (
                <p className="px-1 pt-2 text-xs text-muted-foreground">Type to find more icons.</p>
              )}
            </>
          ) : browsed ? (
            groupBy(browsed.entries, (entry) => entry.category).map(([category, entries]) => (
              <div key={category}>
                <Heading>{category}</Heading>
                <Grid>{entries.map(button)}</Grid>
              </div>
            ))
          ) : (
            <p className="px-1 py-2 text-xs text-muted-foreground">Loading icons…</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
