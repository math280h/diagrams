import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ReactFlowProvider } from '@xyflow/react'
import { CopyPlus, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { EngineProvider } from '@/engine/context'
import { errorMessage } from '@/lib/error-message'
import { saveReadDiagram, withFreshIdentity, type ReadDiagram } from '@/persistence/library-actions'
import { PlayerStage } from '@/player/PlayerStage'
import { readShareData } from './share-link'

type State = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'loaded'; shared: ReadDiagram }

function SharedDiagram({ shared: { diagram, view } }: { shared: ReadDiagram }) {
  const navigate = useNavigate()
  const [flowId, setFlowId] = useState<string | undefined>(undefined)

  const saveCopy = () => {
    const copy = withFreshIdentity(diagram)
    if (!saveReadDiagram({ diagram: copy, view }).ok) return
    void navigate({ to: '/d/$diagramId', params: { diagramId: copy.id } })
  }

  return (
    <ReactFlowProvider>
      <EngineProvider>
        <PlayerStage
          diagram={diagram}
          flowId={flowId}
          onFlowChange={setFlowId}
          actions={
            <Button variant="ghost" size="sm" onClick={saveCopy}>
              <CopyPlus /> <span className="max-sm:hidden">Save a copy</span>
            </Button>
          }
        />
      </EngineProvider>
    </ReactFlowProvider>
  )
}

function SharedLink({ data }: { data: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let active = true
    readShareData(data).then(
      (shared) => active && setState({ kind: 'loaded', shared }),
      (error: unknown) => active && setState({ kind: 'failed', message: errorMessage(error) }),
    )
    return () => {
      active = false
    }
  }, [data])

  if (state.kind === 'loaded') return <SharedDiagram shared={state.shared} />
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      {state.kind === 'loading' ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Opening the shared diagram…
        </p>
      ) : (
        <div className="max-w-sm">
          <p className="text-base font-medium">This link cannot be opened</p>
          <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
          <Button className="mt-5" nativeButton={false} render={<Link to="/" />}>
            Go to all diagrams
          </Button>
        </div>
      )}
    </div>
  )
}

/** Plays the diagram that a share link carries, and saves a copy of it on request. */
export function SharePage() {
  const { data } = useParams({ from: '/s/$data' })
  return <SharedLink key={data} data={data} />
}
