import { ReactFlowProvider, useReactFlow, type Viewport } from '@xyflow/react'
import { History } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useCanvasTheme } from '@/canvas/canvas-theme'
import { useLocalNodes } from '@/canvas/use-local-nodes'
import { DiagramCanvas } from '@/canvas/DiagramCanvas'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EngineProvider } from '@/engine/context'
import type { Diagram } from '@/model/schema'
import { fromDiagram } from '@/persistence/serialize'
import { previewVersion, useVersions } from '@/store/versions'
import { versionAuthor, versionMoment } from './format'
import { restoreVersion } from './restore'

function VersionCanvas({ diagram, viewport }: { diagram: Diagram; viewport: Viewport }) {
  const initial = useMemo(() => fromDiagram(diagram), [diagram])
  const [nodes, onNodesChange] = useLocalNodes(initial.nodes)
  const resolvedTheme = useCanvasTheme(diagram.theme.mode)

  return (
    <DiagramCanvas
      nodes={nodes}
      edges={initial.edges}
      theme={diagram.theme}
      resolvedTheme={resolvedTheme}
      editable={false}
      showCaption={false}
      defaultViewport={viewport}
      onNodesChange={onNodesChange}
      nodesFocusable={false}
      edgesFocusable={false}
    />
  )
}

function PreviewLayer({ id }: { id: string }) {
  const { getViewport } = useReactFlow()
  const [viewport] = useState(getViewport)
  const preview = useVersions((state) => state.preview)
  const unreadable = useVersions((state) => state.previewFailed)
  const meta = useVersions((state) => state.items.find((item) => item.id === id))
  const loaded = preview?.id === id

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') previewVersion(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="absolute inset-0 z-[5] bg-background" data-history-preview aria-busy={!loaded && !unreadable}>
      {preview && (
        <div className={cn('h-full w-full transition-opacity duration-150', !loaded && 'opacity-40')}>
          <ReactFlowProvider>
            <EngineProvider>
              <VersionCanvas diagram={preview.diagram} viewport={viewport} />
            </EngineProvider>
          </ReactFlowProvider>
        </div>
      )}
      {meta && (
        <div
          role="status"
          className="dg-chrome absolute inset-x-3 top-3 z-10 mx-auto flex w-fit max-w-full flex-wrap items-center gap-x-3 gap-y-2 py-1.5 pr-1.5 pl-3"
        >
          <History aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 text-[13px]">
            <span className="font-medium">{versionAuthor(meta)}</span>
            <span className="text-muted-foreground">, {versionMoment(meta.at)}</span>
            {unreadable && <span className="text-destructive">. This version could not be read.</span>}
          </p>
          <div className="flex items-center gap-1">
            <Button size="sm" onClick={() => void restoreVersion(meta)} disabled={!loaded}>
              Restore this version
            </Button>
            <Button size="sm" variant="ghost" onClick={() => previewVersion(null)}>
              Back to current
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Covers the editor canvas with a read-only copy of the version that the user selects in the history panel. */
export function HistoryPreview() {
  const previewId = useVersions((state) => state.previewId)
  return previewId ? <PreviewLayer id={previewId} /> : null
}
