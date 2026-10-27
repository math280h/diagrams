import { ReactFlowProvider } from '@xyflow/react'
import { useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { EngineProvider } from '@/engine/context'
import type { Diagram } from '@/model/schema'
import { PlayerStage } from '@/player/PlayerStage'

function initialFlowId(): string | undefined {
  return new URLSearchParams(window.location.hash.slice(1)).get('flow') ?? undefined
}

/** Plays a diagram on an exported page. The address keeps the chosen flow, so a link can open one flow. */
export function StandalonePlayer({ diagram }: { diagram: Diagram }) {
  const [flowId, setFlowId] = useState(initialFlowId)
  const changeFlow = (id: string) => {
    setFlowId(id)
    window.history.replaceState(null, '', `#flow=${encodeURIComponent(id)}`)
  }
  return (
    <TooltipProvider delay={350}>
      <ReactFlowProvider>
        <EngineProvider>
          <PlayerStage diagram={diagram} flowId={flowId} onFlowChange={changeFlow} />
        </EngineProvider>
      </ReactFlowProvider>
    </TooltipProvider>
  )
}
