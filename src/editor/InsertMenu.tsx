import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@/canvas/icon'
import { ICON_SOURCES, iconSourceOf, loadIconSets, searchIcons, type IconSet } from '@/canvas/icons/library'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent } from '@/components/ui/popover'
import { createEdge } from '@/model/defaults'
import { BOUNDARY_PROVIDERS } from '@/model/boundaries'
import { PRESET_CATEGORIES, PRESETS } from '@/model/presets'
import { addNodes, groupSelection } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { setUi, useUi, type InsertRequest } from '@/store/ui-store'
import { insertResults } from './insert-search'
import { PRESET_MIME, presetNodeAt } from './preset-node'

const BOUNDARY_CATEGORIES = new Set<string>(BOUNDARY_PROVIDERS.map((provider) => provider.id))
const MENU_HEIGHT = 360
const VIEWPORT_MARGIN_PX = 12
const ICON_RESULTS = 24
const ICON_QUERY_MIN = 2
const SEARCH_RESULTS = 40

function Menu({ request }: { request: InsertRequest }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const hasSelection = useDoc((state) => state.nodes.some((node) => node.selected))
  const close = () => setUi({ insert: null })
  const [search, setSearch] = useState('')
  const [iconSets, setIconSets] = useState<IconSet[]>([])
  const searching = search.trim().length > 0
  const results = useMemo(() => {
    const entries = search.trim().length >= ICON_QUERY_MIN ? searchIcons(iconSets, search, ICON_RESULTS) : []
    return insertResults(search, PRESETS, entries).slice(0, SEARCH_RESULTS)
  }, [iconSets, search])

  useEffect(() => {
    let cancelled = false
    void loadIconSets().then((sets) => {
      if (!cancelled) setIconSets(sets)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const { x, y } = request.screen
  const anchor = useMemo(
    () => ({ getBoundingClientRect: () => DOMRect.fromRect({ x, y, width: 0, height: 0 }) }),
    [x, y],
  )

  const wraps = !request.sourceId && hasSelection

  const choose = (presetId: string) => {
    const center = request.sourceId ? { x: request.flow.x + 110, y: request.flow.y } : request.flow
    const node = presetNodeAt(presetId, center)
    close()
    if (!node) return
    if (wraps && node.type === 'group' && groupSelection(node.data)) return
    addNodes([node], request.sourceId ? [createEdge(request.sourceId, node.id)] : [])
  }

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <PopoverContent
        anchor={anchor}
        side="bottom"
        align="start"
        sideOffset={0}
        collisionPadding={VIEWPORT_MARGIN_PX}
        initialFocus={inputRef}
        className="w-[300px] gap-0 rounded-lg bg-transparent p-0 shadow-none ring-0"
      >
        <Command className="dg-menu rounded-lg!" shouldFilter={false}>
          <CommandInput
            ref={inputRef}
            autoFocus
            value={search}
            onValueChange={setSearch}
            placeholder={request.sourceId ? 'Add a connected node' : 'Insert a node or a cloud service'}
          />
          <CommandList style={{ maxHeight: MENU_HEIGHT - 48 }}>
            <CommandEmpty>Nothing matches your search.</CommandEmpty>
            {searching && (
              <CommandGroup heading="Best matches">
                {results.map((result) => {
                  const id = result.kind === 'preset' ? result.preset.id : result.entry.id
                  return (
                    <CommandItem
                      key={id}
                      value={id}
                      onSelect={() => choose(id)}
                      draggable={!request.sourceId}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(PRESET_MIME, id)
                        event.dataTransfer.effectAllowed = 'copy'
                      }}
                      onDragEnd={close}
                    >
                      {result.kind === 'preset' ? (
                        <>
                          <Icon name={result.preset.icon} className="size-4" strokeWidth={1.75} />
                          {result.preset.label}
                          {wraps && BOUNDARY_CATEGORIES.has(result.preset.category) && (
                            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                              wraps the selection
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <Icon name={id} className="size-4" />
                          <span className="truncate">{result.entry.title}</span>
                          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                            {ICON_SOURCES.find((source) => source.id === iconSourceOf(id))?.label}
                          </span>
                        </>
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
            {!searching &&
              PRESET_CATEGORIES.map((category) => (
                <CommandGroup
                  key={category.id}
                  heading={
                    wraps && BOUNDARY_CATEGORIES.has(category.id)
                      ? `${category.label}, wraps the selection`
                      : category.label
                  }
                >
                  {PRESETS.filter((preset) => preset.category === category.id).map((preset) => (
                    <CommandItem
                      key={preset.id}
                      value={`${preset.label} ${preset.keywords.join(' ')}`}
                      onSelect={() => choose(preset.id)}
                      draggable={!request.sourceId}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(PRESET_MIME, preset.id)
                        event.dataTransfer.effectAllowed = 'copy'
                      }}
                      onDragEnd={close}
                    >
                      <Icon name={preset.icon} className="size-4" strokeWidth={1.75} />
                      {preset.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function InsertMenu() {
  const request = useUi((state) => state.insert)
  if (!request) return null
  return <Menu key={`${request.screen.x},${request.screen.y},${request.sourceId ?? ''}`} request={request} />
}
