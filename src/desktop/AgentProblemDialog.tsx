import { ProblemDialog } from '@/components/ProblemDialog'
import { agentProblem, isAgentProblem } from './agent-problem'
import { useAgentStore } from './agent-store'

/** Shows why agents cannot connect to the app, while the agent server has a problem. */
export function AgentProblemDialog() {
  const open = useAgentStore((state) => state.problemOpen)
  const info = useAgentStore((state) => state.info)
  return (
    <ProblemDialog
      open={open}
      onOpenChange={(next) => useAgentStore.setState({ problemOpen: next })}
      problem={isAgentProblem(info) ? agentProblem(info) : null}
    />
  )
}
