import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { ReactFlowProvider } from '@xyflow/react'
import { useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { EngineProvider } from '@/engine/context'
import { loadDiagramOrNull } from '@/persistence/active-repository'
import { storageCopy } from '@/persistence/storage-copy'
import { PlayerStage } from './PlayerStage'

export function PlayerPage() {
  const { diagramId } = useParams({ from: '/p/$diagramId' })
  const { flow, from } = useSearch({ from: '/p/$diagramId' })
  const navigate = useNavigate()
  const diagram = useMemo(() => loadDiagramOrNull(diagramId), [diagramId])
  const exit = useCallback(() => void navigate({ to: '/d/$diagramId', params: { diagramId } }), [navigate, diagramId])
  const parent = useMemo(() => (from ? loadDiagramOrNull(from) : null), [from])
  const openDiagram = useCallback(
    (childId: string) =>
      void navigate({ to: '/p/$diagramId', params: { diagramId: childId }, search: { from: diagramId } }),
    [navigate, diagramId],
  )
  const changeFlow = useCallback(
    (flowId: string) =>
      void navigate({ to: '/p/$diagramId', params: { diagramId }, search: { flow: flowId, from }, replace: true }),
    [navigate, diagramId, from],
  )

  if (!diagram) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        <div className="text-center">
          {storageCopy().missingTitle}
          <div className="mt-4">
            <Button nativeButton={false} render={<Link to="/" />}>
              Go to all diagrams
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <ReactFlowProvider key={diagram.id}>
      <EngineProvider>
        <PlayerStage
          diagram={diagram}
          flowId={flow}
          onFlowChange={changeFlow}
          onExit={exit}
          onOpenDiagram={openDiagram}
          back={
            parent
              ? {
                  label: parent.name,
                  onClick: () => void navigate({ to: '/p/$diagramId', params: { diagramId: parent.id } }),
                }
              : undefined
          }
        />
      </EngineProvider>
    </ReactFlowProvider>
  )
}
