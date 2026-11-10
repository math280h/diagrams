import { Bot } from 'lucide-react'
import { useAgentActivity } from '@/agent/activity-store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useFolderStore } from '@/folder/folder-store'
import { canFollowFolder, canOpenFolder } from '@/folder/support'
import { cn } from '@/lib/utils'
import { openConnectAgent, useAgentProblem } from './agent-store'
import { isDesktop } from './bridge'

const CONNECT_LABEL = 'Connect an agent'

/**
 * Shows when an agent runs a tool, and opens the agent setup. The button shows in the desktop app, and on the website
 * in a browser that can use a folder.
 *
 * @param labelled - If true, the button shows its action as text from the small breakpoint up.
 * @param shortLabel - If true, the button shows "Agent" as text from the large breakpoint up.
 */
export function AgentButton({
  labelled = false,
  shortLabel = false,
  className,
}: {
  labelled?: boolean
  shortLabel?: boolean
  className?: string
}) {
  const tool = useAgentActivity((state) => state.title)
  const readOnly = useAgentActivity((state) => state.readOnly)
  const serverProblem = useAgentProblem()
  const folderProblem = useFolderStore((state) => state.problem !== null)
  const desktop = isDesktop()
  if (!desktop && !canOpenFolder() && !canFollowFolder()) return null
  const problem = desktop ? serverProblem : folderProblem
  const status = readOnly ? 'Agent reading' : 'Agent editing'
  const label = tool ? `${status}: ${tool}` : CONNECT_LABEL
  const text = labelled || shortLabel
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size={tool || labelled ? 'default' : 'icon'}
            aria-label={label}
            onClick={openConnectAgent}
            className={cn('relative', shortLabel && !tool && 'lg:w-auto lg:gap-1.5 lg:px-2.5', className)}
          />
        }
      >
        <Bot />
        {text && !tool && (
          <span className={labelled ? 'hidden sm:inline' : 'hidden lg:inline'}>
            {labelled ? CONNECT_LABEL : 'Agent'}
          </span>
        )}
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
      <TooltipContent>
        {problem
          ? desktop
            ? 'Agents cannot connect. Open for details.'
            : 'The folder has a problem. Open for details.'
          : label}
      </TooltipContent>
    </Tooltip>
  )
}
