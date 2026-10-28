import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { applyEdgeChanges, ReactFlowProvider, type EdgeChange } from '@xyflow/react'
import { ArrowLeft, CopyPlus, Pause, Play, Square } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useCanvasTheme } from '@/canvas/canvas-theme'
import { useLocalNodes } from '@/canvas/use-local-nodes'
import { DiagramCanvas } from '@/canvas/DiagramCanvas'
import { CAPTION_HEIGHT_PX } from '@/canvas/FlowOverlay'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { EngineProvider } from '@/engine/context'
import { compileFlow } from '@/engine/flow/compile'
import { useEngine, usePlaybackState } from '@/engine/hooks'
import { ZoomControls } from '@/editor/ZoomControls'
import type { Flow } from '@/model/schema'
import type { DiagramEdge } from '@/model/types'
import { saveImported, templateCopies } from '@/persistence/library-actions'
import { fromDiagram } from '@/persistence/serialize'
import { useDocumentTitle } from '@/lib/use-document-title'
import { TEMPLATES, type Template } from '@/templates'
import { useReadableFraming } from './use-readable-framing'

function Preview({ template }: { template: Template }) {
  const engine = useEngine()
  const playback = usePlaybackState()
  const navigate = useNavigate()
  const diagram = useMemo(() => template.build(), [template])
  const initial = useMemo(() => fromDiagram(diagram), [diagram])
  useDocumentTitle(`${template.name} template`)
  const [nodes, onNodesChange] = useLocalNodes(initial.nodes)
  const [edges, setEdges] = useState<DiagramEdge[]>(initial.edges)
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null)
  const resolvedTheme = useCanvasTheme(diagram.theme.mode)
  useReadableFraming({ edges: initial.edges, paddingPx: 48, minZoom: 0.5, maxZoom: 1.1, once: true })

  const play = (flow: Flow) => {
    if (activeFlowId === flow.id) {
      engine.playback.toggle()
      return
    }
    engine.setInsets({ top: 0, right: 0, bottom: CAPTION_HEIGHT_PX, left: 0 })
    engine.playback.load(flow.id, compileFlow(flow, new Set(initial.nodes.map((node) => node.id)), initial.edges))
    engine.playback.setFollow(true)
    engine.playback.play()
    setActiveFlowId(flow.id)
  }

  const stop = () => {
    engine.playback.load(null, null)
    engine.setInsets({ top: 0, right: 0, bottom: 0, left: 0 })
    setActiveFlowId(null)
  }

  const use = () => {
    const [copy, ...inside] = templateCopies(template)
    if (!inside.every((part) => saveImported(part).ok) || !saveImported(copy!).ok) return
    void navigate({ to: '/d/$diagramId', params: { diagramId: copy!.id } })
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void navigate({ to: '/' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <div className="flex h-full flex-col">
      <header className="dg-titlebar z-20 flex h-11 shrink-0 items-center gap-1 border-b bg-panel px-1.5">
        <Button variant="ghost" aria-label="All diagrams" nativeButton={false} render={<Link to="/" />}>
          <ArrowLeft /> <span className="hidden sm:inline">All diagrams</span>
        </Button>
        <Separator orientation="vertical" className="mx-1 h-5 data-vertical:self-center" />
        <h1 className="min-w-0 truncate px-1 text-sm font-medium tracking-[-0.01em]" title={template.description}>
          {template.name}
        </h1>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {diagram.flows.map((flow) => {
            const active = activeFlowId === flow.id
            return (
              <Button
                key={flow.id}
                variant={active ? 'secondary' : 'ghost'}
                aria-label={active && playback.playing ? `Pause ${flow.name}` : `Play ${flow.name}`}
                onClick={() => play(flow)}
              >
                {active && playback.playing ? <Pause /> : <Play />}
                <span className="hidden md:inline">{flow.name}</span>
              </Button>
            )
          })}
          {activeFlowId && (
            <Button variant="ghost" size="icon" aria-label="Stop the flow" onClick={stop}>
              <Square />
            </Button>
          )}
          <Separator orientation="vertical" className="mx-1 h-5 data-vertical:self-center" />
          <Button onClick={use}>
            <CopyPlus /> Use this template
          </Button>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        <DiagramCanvas
          nodes={nodes}
          edges={edges}
          theme={diagram.theme}
          resolvedTheme={resolvedTheme}
          editable={false}
          onNodesChange={onNodesChange}
          onEdgesChange={(changes: EdgeChange<DiagramEdge>[]) =>
            setEdges((current) => applyEdgeChanges(changes, current))
          }
          nodesFocusable={false}
          edgesFocusable={false}
        />
        {!activeFlowId && <ZoomControls />}
      </div>
    </div>
  )
}

export function TemplatePreviewPage() {
  const { templateId } = useParams({ from: '/t/$templateId' })
  const template = TEMPLATES.find((candidate) => candidate.id === templateId)

  if (!template) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-base font-medium">This template does not exist</p>
          <Button className="mt-5" nativeButton={false} render={<Link to="/" />}>
            Go to all diagrams
          </Button>
        </div>
      </div>
    )
  }

  return (
    <ReactFlowProvider key={template.id}>
      <EngineProvider key={template.id}>
        <Preview template={template} />
      </EngineProvider>
    </ReactFlowProvider>
  )
}
