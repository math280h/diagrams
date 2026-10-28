import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ReactFlowProvider } from '@xyflow/react'
import { useEffect } from 'react'
import { useReducedMotion } from '@/lib/motion'
import { Button } from '@/components/ui/button'
import { EngineProvider } from '@/engine/context'
import { useEngine } from '@/engine/hooks'
import { ExportDialog } from '@/export/ExportDialog'
import { ImportDialog } from '@/io/ImportDialog'
import { TraceImportDialog } from './flow/TraceImportDialog'
import { saveImported } from '@/persistence/library-actions'
import { storageCopy } from '@/persistence/storage-copy'
import { useDocumentTitle } from '@/lib/use-document-title'
import { useDoc } from '@/store/doc-store'
import { useDiagramDocument } from '@/store/document'
import { useSettings } from '@/store/settings-store'
import { setUi, useUi } from '@/store/ui-store'
import { useVersions } from '@/store/versions'
import { CommandMenu } from './CommandMenu'
import { EditorCanvas } from './EditorCanvas'
import { FlowPanel } from './flow/FlowPanel'
import { HistoryPanel } from './history/HistoryPanel'
import { HistoryPreview } from './history/HistoryPreview'
import { useFlowBinding } from './flow/useFlowBinding'
import { Inspector } from './inspector/Inspector'
import { SensitiveDataPanel } from './SensitiveDataPanel'
import { InsertMenu } from './InsertMenu'
import { useEditorShortcuts } from './shortcuts'
import { ShortcutsDialog } from './ShortcutsDialog'
import { TopBar } from './TopBar'

function useAmbientMotion() {
  const engine = useEngine()
  const enabled = useSettings((state) => state.ambientMotion)
  const reducedMotion = useReducedMotion()
  useEffect(() => {
    engine.ambient.setRunning(enabled && !reducedMotion)
  }, [engine, enabled, reducedMotion])
}

function RecordingHint() {
  const recording = useUi((state) => state.recording)
  if (!recording) return null
  return (
    <div className="dg-chrome pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 px-3 py-1.5 text-xs">
      <span className="mr-2 inline-block size-2 rounded-full bg-destructive" />
      Click the nodes in the order the flow reaches them. Shift-click to reach a node at the same time. Press Esc to
      stop.
    </div>
  )
}

function EditorShell() {
  const engine = useEngine()
  const navigate = useNavigate()
  useEditorShortcuts(engine)
  useFlowBinding()
  useAmbientMotion()
  const flowPanelOpen = useUi((state) => state.flowPanelOpen)
  const importOpen = useUi((state) => state.importOpen)
  const historyOpen = useUi((state) => state.historyOpen)
  const sensitiveView = useUi((state) => state.sensitiveView)
  const previewing = useVersions((state) => state.previewId !== null)

  useEffect(
    () => () =>
      setUi({
        recording: false,
        selectedStepId: null,
        commandOpen: false,
        exportOpen: null,
        insert: null,
        historyOpen: false,
      }),
    [],
  )

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        {sensitiveView && <SensitiveDataPanel />}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <EditorCanvas />
            <RecordingHint />
            <HistoryPreview />
          </div>
          {flowPanelOpen && (
            <div inert={previewing} className="contents">
              <FlowPanel />
            </div>
          )}
        </div>
        {historyOpen ? <HistoryPanel /> : <Inspector />}
      </div>
      <InsertMenu />
      <CommandMenu />
      <ExportDialog />
      <ShortcutsDialog />
      <TraceImportDialog />
      <ImportDialog
        open={importOpen}
        onOpenChange={(open) => setUi({ importOpen: open })}
        onImported={(diagram) => {
          if (!saveImported(diagram).ok) return
          setUi({ importOpen: false })
          void navigate({ to: '/d/$diagramId', params: { diagramId: diagram.id } })
        }}
      />
    </div>
  )
}

function Problem({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="max-w-sm text-center">
        <p className="text-base font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
        <Button className="mt-5" nativeButton={false} render={<Link to="/" />}>
          Go to all diagrams
        </Button>
      </div>
    </div>
  )
}

export function EditorPage() {
  const { diagramId } = useParams({ from: '/d/$diagramId' })
  const status = useDiagramDocument(diagramId)
  const previewing = useVersions((state) => state.previewId !== null)
  const name = useDoc((state) => (status.kind === 'ready' ? state.name : null))
  useDocumentTitle(name)

  if (status.kind === 'loading') return null
  if (status.kind === 'missing') {
    return <Problem title={storageCopy().missingTitle} detail={storageCopy().missingDetail} />
  }
  if (status.kind === 'invalid') return <Problem title="This diagram cannot be read" detail={status.message} />

  return (
    <ReactFlowProvider key={diagramId}>
      <EngineProvider key={diagramId} running={!previewing}>
        <EditorShell />
      </EngineProvider>
    </ReactFlowProvider>
  )
}
