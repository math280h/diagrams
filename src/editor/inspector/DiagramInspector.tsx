import {
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignCenterHorizontal,
  Group,
  Keyboard,
  LayoutGrid,
  Pause,
  Play,
  StretchHorizontal,
  StretchVertical,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { takesColor, type DiagramNode } from '@/model/types'
import {
  alignSelection,
  colorNodes,
  distributeSelection,
  groupSelection,
  setTheme,
  updateEdgesTraffic,
} from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { useSettings } from '@/store/settings-store'
import { setUi } from '@/store/ui-store'
import { useFitToScreen } from '@/editor/fit'
import { tidyUp } from '@/editor/layout-command'
import { plural } from '@/lib/format'
import { ColorPicker, Field, Section, Segmented, SwitchField } from './controls'

const ALIGN_LABELS = {
  left: 'Align left',
  center: 'Align centre',
  right: 'Align right',
  top: 'Align top',
  middle: 'Align middle',
  bottom: 'Align bottom',
} as const

export function StylePanel() {
  const theme = useDoc((state) => state.theme)
  const edges = useDoc((state) => state.edges)
  const appTheme = useSettings((state) => state.theme)
  const setAppTheme = useSettings((state) => state.setTheme)
  const ambientMotion = useSettings((state) => state.ambientMotion)
  const setAmbientMotion = useSettings((state) => state.setAmbientMotion)
  const fitToScreen = useFitToScreen()
  const allEdgeIds = new Set(edges.map((edge) => edge.id))
  const animated = edges.filter((edge) => edge.data?.traffic.enabled).length
  const styles = new Set(edges.map((edge) => edge.data?.traffic.style))
  const sharedTrafficStyle = styles.size === 1 ? (edges[0]?.data?.traffic.style ?? null) : null

  return (
    <>
      <Section title="Canvas">
        <Field label="Theme">
          <Segmented
            label="Canvas theme"
            value={theme.mode}
            onChange={(mode) => setTheme({ mode })}
            options={[
              { value: 'auto', label: 'Same as app' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Field>
        <Field label="Background">
          <Segmented
            label="Background"
            value={theme.background}
            onChange={(background) => setTheme({ background })}
            options={[
              { value: 'dots', label: 'Dots' },
              { value: 'grid', label: 'Lines' },
              { value: 'none', label: 'None' },
            ]}
          />
        </Field>
        <Field label="Typeface">
          <Segmented
            label="Typeface"
            value={theme.fonts}
            onChange={(fonts) => setTheme({ fonts })}
            options={[
              { value: 'host', label: 'Host' },
              { value: 'atkinson', label: 'Atkinson' },
              { value: 'inter', label: 'Inter' },
              { value: 'plex', label: 'Plex' },
            ]}
          />
        </Field>
        <SwitchField label="Snap to grid" checked={theme.snap} onChange={(snap) => setTheme({ snap })} />
        <SwitchField
          label="Route connections around nodes"
          checked={theme.routeAround}
          onChange={(routeAround) => setTheme({ routeAround })}
        />
        <SwitchField
          label="Colour boundaries by kind"
          checked={theme.boundaryColors}
          onChange={(boundaryColors) => setTheme({ boundaryColors })}
        />
        <SwitchField
          label="Colour connections by protocol"
          checked={theme.protocolColors}
          onChange={(protocolColors) => setTheme({ protocolColors })}
        />
      </Section>
      <Section title="Traffic">
        {edges.length === 0 ? (
          <p className="text-xs text-muted-foreground">New connections have no traffic. Turn it on per connection.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {animated} of {plural(edges.length, 'connection')} show traffic.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <Button variant="outline" size="sm" onClick={() => updateEdgesTraffic(allEdgeIds, { enabled: true })}>
                <Play /> Animate all
              </Button>
              <Button variant="outline" size="sm" onClick={() => updateEdgesTraffic(allEdgeIds, { enabled: false })}>
                <Pause /> Stop all
              </Button>
            </div>
            <Field label="Style for all">
              <Segmented
                label="Traffic style for all connections"
                className="w-full"
                value={sharedTrafficStyle}
                onChange={(style) => updateEdgesTraffic(allEdgeIds, { style })}
                options={[
                  { value: 'dots', label: 'Dots' },
                  { value: 'comets', label: 'Comets' },
                  { value: 'dashes', label: 'Dashes' },
                  { value: 'pulse', label: 'Pulse' },
                ]}
              />
            </Field>
          </>
        )}
        <SwitchField label="Animate traffic while editing" checked={ambientMotion} onChange={setAmbientMotion} />
      </Section>
      <Section title="Layout">
        <div className="grid grid-cols-2 gap-1.5">
          <Button variant="outline" size="sm" onClick={() => tidyUp('RIGHT', fitToScreen)}>
            <LayoutGrid /> Left to right
          </Button>
          <Button variant="outline" size="sm" onClick={() => tidyUp('DOWN', fitToScreen)}>
            <LayoutGrid className="rotate-90" /> Top to bottom
          </Button>
        </div>
      </Section>
      <Section title="App">
        <Field label="Theme">
          <Segmented
            label="App theme"
            value={appTheme}
            onChange={setAppTheme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Field>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => setUi({ shortcutsOpen: true })}
        >
          <Keyboard /> Keyboard shortcuts
        </Button>
      </Section>
    </>
  )
}

export function MultiInspector({ nodes }: { nodes: DiagramNode[] }) {
  const colored = nodes.filter(takesColor)
  const colors = new Set(colored.map((node) => node.data.color))
  return (
    <>
      <Section title="Arrange">
        <Field label="Align">
          <div className="grid grid-cols-6 gap-1">
            {(
              [
                ['left', AlignStartVertical],
                ['center', AlignCenterVertical],
                ['right', AlignEndVertical],
                ['top', AlignStartHorizontal],
                ['middle', AlignCenterHorizontal],
                ['bottom', AlignEndHorizontal],
              ] as const
            ).map(([alignment, IconComponent]) => (
              <Button
                key={alignment}
                variant="ghost"
                size="icon-sm"
                title={ALIGN_LABELS[alignment]}
                aria-label={ALIGN_LABELS[alignment]}
                onClick={() => alignSelection(alignment)}
              >
                <IconComponent />
              </Button>
            ))}
          </div>
        </Field>
        <Field label="Distribute">
          <div className="grid grid-cols-2 gap-1.5">
            <Button variant="outline" size="sm" onClick={() => distributeSelection('x')} disabled={nodes.length < 3}>
              <StretchHorizontal /> Across
            </Button>
            <Button variant="outline" size="sm" onClick={() => distributeSelection('y')} disabled={nodes.length < 3}>
              <StretchVertical /> Down
            </Button>
          </div>
        </Field>
        <Button variant="outline" size="sm" className="w-full" onClick={() => groupSelection()}>
          <Group /> Group selection
        </Button>
      </Section>
      {colored.length > 0 && (
        <Section title="Colour">
          <ColorPicker
            value={colors.size === 1 ? colored[0]!.data.color : null}
            onChange={(color) =>
              colorNodes(
                colored.map((node) => node.id),
                color,
              )
            }
          />
          {colored.length < nodes.length && (
            <p className="text-xs text-muted-foreground">
              The colour applies to the nodes and shapes in the selection.
            </p>
          )}
        </Section>
      )}
    </>
  )
}
