import { Button } from '@/components/ui/button'
import { IntroStrip } from '@/library/IntroStrip'
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
    <IntroStrip
      headingId="agent-intro-heading"
      title="Let an AI agent draw with you"
      actions={desktop ? <DesktopAction /> : <DesktopDownloadLink variant="secondary" allDownloads />}
      closeLabel="Hide the agent introduction"
      onClose={hideAgentIntro}
      className={className}
    >
      {desktop
        ? `Connect Claude Code or another MCP client, then ask it to ${EXAMPLE_REQUEST}. You watch the diagram appear here, and you can undo any change it makes.`
        : `The desktop app connects to Claude Code and other MCP clients. Ask one to ${EXAMPLE_REQUEST} and watch the diagram appear, with the files kept on your computer.`}
    </IntroStrip>
  )
}
