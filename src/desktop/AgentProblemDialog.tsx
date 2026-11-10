import { useState } from 'react'
import { toast } from 'sonner'
import { ProblemDialog } from '@/components/ProblemDialog'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/error-message'
import { agentProblem, isAgentProblem } from './agent-problem'
import { changeAgentPort, useAgentStore } from './agent-store'

function MovePort() {
  const [moving, setMoving] = useState(false)
  const move = () => {
    setMoving(true)
    void changeAgentPort()
      .then((info) => {
        if (info?.state === 'running') toast.success(`Agents now connect on port ${info.port}. Run the setup again.`)
      })
      .catch((error: unknown) => toast.error('Could not change the port', { description: errorMessage(error) }))
      .finally(() => setMoving(false))
  }
  return (
    <div className="space-y-2 text-[13px] text-muted-foreground">
      <Button variant="secondary" size="sm" disabled={moving} onClick={move}>
        Use another port
      </Button>
      <p>With another port, agents that you set up before need the setup again.</p>
    </div>
  )
}

/** Shows why agents cannot connect to the app, while the agent server has a problem. */
export function AgentProblemDialog() {
  const open = useAgentStore((state) => state.problemOpen)
  const info = useAgentStore((state) => state.info)
  const problem = isAgentProblem(info) ? info : null
  return (
    <ProblemDialog
      open={open}
      onOpenChange={(next) => useAgentStore.setState({ problemOpen: next })}
      problem={problem && agentProblem(problem)}
      actions={problem?.state === 'port-in-use' ? <MovePort /> : null}
    />
  )
}
