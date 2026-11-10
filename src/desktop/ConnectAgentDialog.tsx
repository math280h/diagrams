import { useState } from 'react'
import { toast } from 'sonner'
import { CommandBlock } from '@/components/CommandBlock'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { isAgentProblem } from './agent-problem'
import { openAgentProblem, resetAgentToken, useAgentHistory, useAgentStore } from './agent-store'
import { CLAUDE_MARKETPLACE_NAME, CLAUDE_PLUGIN_NAME, CLAUDE_PLUGIN_TOKEN_KEY } from './constants'
import type { AgentInfo } from './contract'

function statusText(info: AgentInfo | null, lastCallAt: number | null) {
  if (!info || info.state === 'starting') return { tone: 'muted', text: 'Starting the agent server…' }
  if (info.state === 'running') {
    const lastCall = lastCallAt === null ? '' : `. Last agent call ${relativeTime(lastCallAt)}`
    return { tone: 'ok', text: `Agents can connect at ${info.url}${lastCall}` }
  }
  return { tone: 'error', text: info.message ?? 'The agent server stopped.' }
}

function Status({ info }: { info: AgentInfo | null }) {
  const lastCallAt = useAgentHistory((state) => state.lastCallAt)
  const { tone, text } = statusText(info, lastCallAt)
  return (
    <p className="flex items-center gap-2 text-[13px]">
      <span
        aria-hidden
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          tone === 'ok' ? 'bg-ok' : tone === 'error' ? 'bg-destructive' : 'bg-muted-foreground',
        )}
      />
      <span className={cn('min-w-0 break-all', tone === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
        {text}
      </span>
    </p>
  )
}

function PluginSteps({ info }: { info: AgentInfo }) {
  if (!info.marketplacePath) return <p className="text-[13px] text-muted-foreground">Preparing the plugin…</p>
  return (
    <div className="space-y-4">
      <CommandBlock
        label="1. Add the plugin source that this app keeps up to date"
        value={`claude plugin marketplace add "${info.marketplacePath}"`}
      />
      <CommandBlock
        label="2. Install the plugin with your access token"
        value={`claude plugin install ${CLAUDE_PLUGIN_NAME}@${CLAUDE_MARKETPLACE_NAME} --scope user --config ${CLAUDE_PLUGIN_TOKEN_KEY}=${info.token}`}
      />
      <p className="text-[13px] leading-5 text-muted-foreground">
        3. Start a new Claude Code session and ask for a diagram. The plugin teaches Claude how to draw, animate and
        review diagrams, and adds the commands /diagrams:architecture, /diagrams:flows and /diagrams:review.
      </p>
    </div>
  )
}

function ServerSteps({ info }: { info: AgentInfo }) {
  const json = JSON.stringify(
    { mcpServers: { diagrams: { type: 'http', url: info.url, headers: { Authorization: `Bearer ${info.token}` } } } },
    null,
    2,
  )
  return (
    <div className="space-y-4">
      <CommandBlock
        label="Claude Code"
        value={`claude mcp add --transport http --scope user diagrams ${info.url} --header "Authorization: Bearer ${info.token}"`}
      />
      <CommandBlock label="Other MCP clients" value={json} />
    </div>
  )
}

function TokenReset() {
  const [confirming, setConfirming] = useState(false)
  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        Reset token
      </Button>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] text-muted-foreground">
        Connected agents stop working until you set them up again.
      </span>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => {
          setConfirming(false)
          void resetAgentToken().then(() => toast.success('The token changed. Run the setup again.'))
        }}
      >
        Reset
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  )
}

/** Shows how to connect Claude Code or another MCP client to this app. */
export function ConnectAgentDialog() {
  const { info, dialogOpen } = useAgentStore()
  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => useAgentStore.setState({ dialogOpen: open })}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Connect an agent</DialogTitle>
          <DialogDescription>
            Agents such as Claude Code can read, change and render your diagrams while you watch. They connect to this
            app on your computer. An agent sends the diagrams that it reads to its model provider, like the rest of your
            chat with it.
          </DialogDescription>
        </DialogHeader>
        <Status info={info} />
        {isAgentProblem(info) && (
          <button
            type="button"
            onClick={openAgentProblem}
            className="-mt-2 self-start pl-3.5 text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            More details…
          </button>
        )}
        {info && (
          <Tabs defaultValue="plugin">
            <TabsList>
              <TabsTrigger value="plugin">Claude Code plugin</TabsTrigger>
              <TabsTrigger value="server">MCP server only</TabsTrigger>
            </TabsList>
            <TabsContent value="plugin" className="pt-3">
              <PluginSteps info={info} />
            </TabsContent>
            <TabsContent value="server" className="pt-3">
              <ServerSteps info={info} />
            </TabsContent>
          </Tabs>
        )}
        <div className="space-y-2 border-t pt-4 text-[13px] text-muted-foreground">
          <p>Set up one of the two, not both. With both, Claude Code connects to the app twice.</p>
          <p>
            The app takes connections only from this computer. A program here with the access token can read and change
            your diagrams, so keep the token private.
          </p>
          <TokenReset />
        </div>
      </DialogContent>
    </Dialog>
  )
}
