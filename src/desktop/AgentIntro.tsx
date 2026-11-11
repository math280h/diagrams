import { Button } from '@/components/ui/button'
import { canFollowFolder, canOpenFolder } from '@/folder/support'
import { IntroStrip } from '@/library/IntroStrip'
import {
  hideAgentIntro,
  openAgentProblem,
  openConnectAgent,
  useAgentIntroVisible,
  useAgentProblem,
} from './agent-store'
import { isDesktop } from './bridge'
import { DesktopDownloadLink } from './DesktopDownloadLink'

const EXAMPLE_REQUEST = '“draw our checkout with Stripe”'

function DesktopAction() {
  const problem = useAgentProblem()
  return (
    <>
      {problem && (
        <span className="flex flex-col text-[13px] leading-5">
          <span className="text-destructive">Agents cannot connect</span>
          <button
            type="button"
            onClick={openAgentProblem}
            className="self-start text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            More details…
          </button>
        </span>
      )}
      <Button variant="secondary" onClick={openConnectAgent}>
        Connect an agent
      </Button>
    </>
  )
}

function WebsiteText() {
  if (!canOpenFolder() && !canFollowFolder()) {
    return `Claude Code and other MCP clients connect to the desktop app. Ask your agent to ${EXAMPLE_REQUEST} and watch the diagram appear.`
  }
  return (
    <>
      Ask Claude Code to {EXAMPLE_REQUEST} and watch the diagram appear. It connects to the desktop app, or works
      through{' '}
      <Button variant="link" className="h-auto p-0 text-[13px] text-foreground" onClick={openConnectAgent}>
        a folder of your project
      </Button>{' '}
      with nothing to install.
    </>
  )
}

/**
 * Introduces agent control on the library: the agent setup in the desktop app, and on the website the desktop app or a
 * folder of diagram files.
 */
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
      {desktop ? (
        `Connect Claude Code or another MCP client, then ask it to ${EXAMPLE_REQUEST}. The diagram appears here as the agent draws. You can undo each change.`
      ) : (
        <WebsiteText />
      )}
    </IntroStrip>
  )
}
