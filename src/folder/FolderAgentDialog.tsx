import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { useAgentHistory, useAgentStore } from '@/desktop/agent-store'
import { CommandBlock } from '@/desktop/ConnectAgentDialog'
import { DesktopDownloadLink } from '@/desktop/DesktopDownloadLink'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { AGENT_FOLDER, claudeInstruction } from './agent-paths'
import { pickFolder, useFolderSettings, useFolderStore } from './folder-store'
import { canOpenFolder } from './support'

function Status({ name, agents }: { name: string; agents: boolean }) {
  const lastCallAt = useAgentHistory((state) => state.lastCallAt)
  const problem = useFolderStore((state) => state.problem)
  const tone = problem ? 'error' : agents ? 'ok' : 'muted'
  const text = problem
    ? problem
    : agents
      ? `Agents can work in “${name}”${lastCallAt === null ? '' : `. Last agent call ${relativeTime(lastCallAt)}`}`
      : `Agents cannot use “${name}”. Turn it on below.`
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

function OpenFolderSteps() {
  return (
    <div className="space-y-3 text-[13px] leading-5 text-muted-foreground">
      <p>
        1. Open a folder in your project, for example <span className="font-mono">docs/diagrams</span>. The website
        keeps the diagrams there as files, and the diagrams in this browser stay here for later.
      </p>
      <Button variant="secondary" onClick={() => void pickFolder({ agents: true })}>
        Open a folder
      </Button>
      <p>2. Then add one line to the CLAUDE.md of your project. This window shows it when the folder is open.</p>
    </div>
  )
}

function AgentSteps({ name }: { name: string }) {
  const agents = useFolderSettings((state) => state.agents)
  return (
    <div className="space-y-4">
      <Status name={name} agents={agents} />
      <label className="flex items-center justify-between gap-4 text-[13px]">
        <span>Let agents use this folder</span>
        <Switch checked={agents} onCheckedChange={(checked) => useFolderSettings.setState({ agents: checked })} />
      </label>
      {agents && (
        <>
          <CommandBlock
            label="Add this line to the CLAUDE.md of your project, or give it to Claude Code at the start"
            value={claudeInstruction(name)}
          />
          <p className="text-[13px] leading-5 text-muted-foreground">
            Then ask for a diagram. Keep this tab open while Claude works: the tools run here, and you see each change.
            The website keeps the guide, the tool list and the icon list in{' '}
            <span className="font-mono">
              {name}/{AGENT_FOLDER}
            </span>
            .
          </p>
        </>
      )}
    </div>
  )
}

/** Explains on the website how Claude Code works on the diagrams through a folder, without a desktop app. */
export function FolderAgentDialog() {
  const dialogOpen = useAgentStore((state) => state.dialogOpen)
  const status = useFolderStore((state) => state.status)
  const name = useFolderStore((state) => state.name)
  const supported = canOpenFolder()
  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => useAgentStore.setState({ dialogOpen: open })}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Work with Claude Code in a folder</DialogTitle>
          <DialogDescription>
            Claude Code changes the diagrams through files in a folder of your project, and this tab shows each change.
            You install nothing.
          </DialogDescription>
        </DialogHeader>
        {!supported ? (
          <div className="space-y-3 text-[13px] leading-5 text-muted-foreground">
            <p>This needs Chrome or Edge, which let a website use a folder. In other browsers, use the desktop app.</p>
            <DesktopDownloadLink variant="secondary" />
          </div>
        ) : status === 'open' && name ? (
          <AgentSteps name={name} />
        ) : (
          <OpenFolderSteps />
        )}
      </DialogContent>
    </Dialog>
  )
}
