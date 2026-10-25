import { useEffect } from 'react'
import { useEngine } from '@/engine/hooks'
import { compileFlow } from '@/engine/flow/compile'
import { useDoc } from '@/store/doc-store'
import { useUi } from '@/store/ui-store'

/**
 * Compiles the active flow and gives it to the engine.
 *
 * If the flow panel is not open, the engine shows no flow.
 */
export function useFlowBinding() {
  const engine = useEngine()
  const flows = useDoc((state) => state.flows)
  const nodes = useDoc((state) => state.nodes)
  const edges = useDoc((state) => state.edges)
  const activeFlowId = useUi((state) => state.activeFlowId)
  const open = useUi((state) => state.flowPanelOpen)

  useEffect(() => {
    if (!open) return
    const current = useUi.getState().activeFlowId
    if (!current || !flows.some((flow) => flow.id === current)) {
      useUi.setState({ activeFlowId: flows[0]?.id ?? null, selectedStepId: null })
    }
  }, [open, flows])

  const flow = open ? flows.find((candidate) => candidate.id === activeFlowId) : undefined
  const nodeIds = nodes.map((node) => node.id).join('|')

  useEffect(() => {
    if (!flow) {
      engine.playback.load(null, null)
      return
    }
    const timeline = compileFlow(flow, new Set(nodeIds.split('|')), edges)
    engine.playback.load(flow.id, timeline)
  }, [engine, flow, nodeIds, edges])
}
