import { Bot } from 'lucide-react'
import { useAgentActivity } from '@/agent/activity-store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { openConnectAgent, useAgentProblem } from './agent-store'
import { isDesktop } from './bridge'

const CONNECT_LABEL = 'Connect an agent'

/**
 * Shows when an agent runs a tool, and opens the agent setup. The button shows only in the desktop app.
 *
 * @param labelled - If true, the button shows its action as text from the small breakpoint up.
 */
export function AgentButton({ labelled = false, className }: { labelled?: boolean; className?: string }) {
  const tool = useAgentActivity((state) => state.title)
  const readOnly = useAgentActivity((state) => state.readOnly)
  const problem = useAgentProblem()
  if (!isDesktop()) return null
  const status = readOnly ? 'Agent reading' : 'Agent editing'
  const label = tool ? `${status}: ${tool}` : CONNECT_LABEL
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size={tool || labelled ? 'default' : 'icon'}
            aria-label={label}
            onClick={openConnectAgent}
            className={cn('relative', className)}
          />
        }
      >
        <Bot />
        {labelled && !tool && <span className="hidden sm:inline">{CONNECT_LABEL}</span>}
        {tool && (
          <span className="flex items-center gap-1.5 text-[13px]">
            <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-foreground" />
            {status}
          </span>
        )}
        {problem && !tool && (
          <span aria-hidden className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-destructive" />
        )}
      </TooltipTrigger>
      <TooltipContent>{problem ? 'Agents cannot connect. Open for details.' : label}</TooltipContent>
    </Tooltip>
  )
}
