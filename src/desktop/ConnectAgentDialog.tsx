import { Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { resetAgentToken, useAgentHistory, useAgentStore } from './agent-store'
import { CLAUDE_MARKETPLACE_NAME, CLAUDE_PLUGIN_NAME, CLAUDE_PLUGIN_TOKEN_KEY } from './constants'
import type { AgentInfo } from './contract'

function copy(text: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast.success('Copied'),
    () => toast.error('Could not copy. Select the text and copy it.'),
  )
}

function CommandBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 py-2 pr-1.5 pl-3">
        <code className="min-w-0 flex-1 font-mono text-xs leading-5 break-all whitespace-pre-wrap select-all [font-variant-ligatures:none]">
          {value}
        </code>
        <Button variant="ghost" size="icon-xs" aria-label={`Copy: ${label}`} onClick={() => copy(value)}>
          <Copy />
        </Button>
      </div>
    </div>
  )
}

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
            app on your computer, and your diagrams stay here.
          </DialogDescription>
        </DialogHeader>
        <Status info={info} />
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
          <p>Anyone with the access token can read and change your diagrams. Keep it private.</p>
          <TokenReset />
        </div>
      </DialogContent>
    </Dialog>
  )
}
