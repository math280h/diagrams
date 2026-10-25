import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { hideAgentIntro, openConnectAgent, useAgentIntroVisible, useAgentProblem } from './agent-store'
import { isDesktop } from './bridge'
import { DesktopDownloadLink } from './DesktopDownloadLink'

const EXAMPLE_REQUEST = '“draw our checkout with Stripe”'

function DesktopAction() {
  const problem = useAgentProblem()
  return (
    <>
      {problem && <span className="text-[13px] text-destructive">Agents cannot connect</span>}
      <Button variant="secondary" onClick={openConnectAgent}>
        Connect an agent
      </Button>
    </>
  )
}

/** Introduces agent control on the library: the agent setup in the desktop app, the desktop app on the website. */
export function AgentIntro({ className }: { className?: string }) {
  const visible = useAgentIntroVisible()
  const desktop = isDesktop()
  if (!visible) return null
  return (
    <section
      aria-labelledby="agent-intro-heading"
      className={cn(
        'relative flex flex-col gap-4 rounded-xl border bg-panel py-4 pr-12 pl-5 sm:flex-row sm:items-center sm:gap-8',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h2 id="agent-intro-heading" className="text-[15px] font-medium tracking-[-0.01em]">
          Let an AI agent draw with you
        </h2>
        <p className="mt-1 max-w-2xl text-[13px] leading-5 text-pretty text-muted-foreground">
          {desktop
            ? `Connect Claude Code or another MCP client, then ask it to ${EXAMPLE_REQUEST}. You watch the diagram appear here, and you can undo any change it makes.`
            : `The desktop app connects to Claude Code and other MCP clients. Ask one to ${EXAMPLE_REQUEST} and watch the diagram appear, with the files kept on your computer.`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {desktop ? <DesktopAction /> : <DesktopDownloadLink variant="secondary" allDownloads />}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Hide the agent introduction"
        className="absolute top-2.5 right-2.5"
        onClick={hideAgentIntro}
      >
        <X />
      </Button>
    </section>
  )
}
