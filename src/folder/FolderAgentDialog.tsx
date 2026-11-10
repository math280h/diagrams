import { useRouterState } from '@tanstack/react-router'
import { AppWindow, ArrowUpRight, CircleCheck, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAgentHistory, useAgentStore } from '@/desktop/agent-store'
import { CommandBlock } from '@/desktop/ConnectAgentDialog'
import { DesktopDownloadLink } from '@/desktop/DesktopDownloadLink'
import { OPEN_APP_LINK, useKnowsDesktopApp } from '@/desktop/open-in-app'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { repository } from '@/persistence/active-repository'
import { exportDiagramJson } from '@/persistence/library-actions'
import { useDoc } from '@/store/doc-store'
import { currentDiagram, flushPendingSave } from '@/store/document'
import { AGENT_FOLDER, claudeInstruction, fileGuideInstruction } from './agent-paths'
import { pickFolder, useFolderSettings, useFolderStore } from './folder-store'
import { canFollowFolder, followFolder } from './followed-folder'
import { canOpenFolder } from './support'

function downloadGuide() {
  void import('./agent-guide').then((guide) => guide.downloadFileGuide())
}

function downloadIcons() {
  void import('./agent-guide').then((guide) => guide.downloadIconList())
}

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

const EDITOR_PATH = /^\/d\/([^/]+)$/

/** Returns the diagram that the editor shows from the storage of this browser, or `null`. */
function useOpenBrowserDiagram(): { id: string; name: string } | null {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const name = useDoc((state) => state.name)
  const match = EDITOR_PATH.exec(pathname)
  if (!match?.[1] || repository().location.kind !== 'browser') return null
  return { id: decodeURIComponent(match[1]), name }
}

function downloadOpenDiagram() {
  flushPendingSave()
  exportDiagramJson(currentDiagram())
}

function OpenFolderSteps() {
  const open = useOpenBrowserDiagram()
  return (
    <div className="space-y-3 text-[13px] leading-5 text-muted-foreground">
      <p>
        1. Open a folder in your project, for example <span className="font-mono">docs/diagrams</span>. The website
        keeps the diagrams there as files{open ? `, and copies “${open.name}” into it for Claude Code` : ''}. The
        diagrams in this browser stay here for later.
      </p>
      <Button variant="secondary" onClick={() => void pickFolder({ agents: true, copy: open ? [open.id] : [] })}>
        {open ? `Open a folder and copy “${open.name}”` : 'Open a folder'}
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

const MOZILLA_POSITION_URL = 'https://github.com/mozilla/standards-positions/issues/154'

function Browsers({ or = false }: { or?: boolean }) {
  return (
    <>
      <strong className="font-semibold text-foreground">Chrome</strong> {or ? 'or' : 'and'}{' '}
      <strong className="font-semibold text-foreground">Microsoft Edge</strong>
    </>
  )
}

function Note({ ok, title, children }: { ok: boolean; title: string; children: ReactNode }) {
  const Icon = ok ? CircleCheck : TriangleAlert
  return (
    <div
      className={cn(
        'flex gap-3 rounded-lg border px-3.5 py-3 text-[13px] leading-5',
        ok ? 'border-ok/30 bg-ok/10' : 'border-warn/40 bg-warn/10',
      )}
    >
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', ok ? 'text-ok' : 'text-warn')} />
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-muted-foreground">{children}</p>
      </div>
    </div>
  )
}

/** Says how well this browser supports a folder: fully in Chrome and Microsoft Edge, only to read elsewhere. */
function BrowserSupportNote() {
  if (canOpenFolder()) {
    return (
      <Note ok title="This browser supports folders">
        <Browsers /> let the website read and write a folder, so Claude Code gets all the tools.
      </Note>
    )
  }
  return (
    <Note ok={false} title="Full folder support needs Chrome or Microsoft Edge">
      This browser only lets the website read a folder: it cannot save your changes there, and agents cannot use the
      diagram tools. <Browsers /> can save and run agent tools. The desktop app can too, so you do not have to change
      browsers.{' '}
      <a
        href={MOZILLA_POSITION_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-0.5 font-medium text-foreground hover:underline"
      >
        Why not in Firefox <ArrowUpRight aria-hidden className="size-3.5" />
      </a>
    </Note>
  )
}

const CONNECT_IN_APP =
  'In the app, choose Connect an agent. It gives the commands for the Claude Code plugin, or for any MCP client.'

function DesktopSteps() {
  const knownApp = useKnowsDesktopApp()
  return (
    <div className="space-y-3 text-[13px] leading-5 text-muted-foreground">
      <p>
        The desktop app keeps the diagrams as files on your computer and runs an MCP server. Claude Code, Claude Desktop
        and other MCP clients connect to it with all the tools and skills, and no browser tab has to stay open.
      </p>
      {knownApp ? (
        <>
          <Note ok title="You have used the desktop app from this browser">
            {CONNECT_IN_APP}
          </Note>
          <div className="flex flex-wrap items-center gap-3">
            <a href={OPEN_APP_LINK} className={buttonVariants({ variant: 'secondary' })}>
              <AppWindow /> Open the desktop app
            </a>
            <DesktopDownloadLink variant="ghost" />
          </div>
        </>
      ) : (
        <>
          <p>
            1. Install the desktop app. This needs an install: where you cannot install anything, use a folder here.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <DesktopDownloadLink variant="secondary" allDownloads />
          </div>
          <p>2. {CONNECT_IN_APP}</p>
          <p>
            Already installed?{' '}
            <a href={OPEN_APP_LINK} className="font-medium text-foreground hover:underline">
              Open the desktop app
            </a>
          </p>
        </>
      )}
    </div>
  )
}

function ReadOnlySteps() {
  const open = useOpenBrowserDiagram()
  const status = useFolderStore((state) => state.status)
  const name = useFolderStore((state) => state.name)
  if (status !== 'following' || !name) {
    return (
      <div className="space-y-3">
        {open && (
          <div className="space-y-2 text-[13px] leading-5 text-muted-foreground">
            <p>1. Save “{open.name}” in a folder of your project, so that Claude Code can change it.</p>
            <Button variant="ghost" onClick={downloadOpenDiagram}>
              Download the diagram file
            </Button>
            <p>2. Then show that folder here.</p>
          </div>
        )}
        <Button variant="secondary" onClick={() => void followFolder()}>
          Show a folder
        </Button>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <div className="space-y-2 text-[13px] leading-5 text-muted-foreground">
        <p>
          1. Save the guide in <span className="font-mono">{name}</span>. It tells Claude Code the file format. The icon
          list is for products and services.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={downloadGuide}>
            Download the guide
          </Button>
          <Button variant="ghost" onClick={downloadIcons}>
            Download the icon list
          </Button>
        </div>
      </div>
      <CommandBlock label="2. Add this line to the CLAUDE.md of your project" value={fileGuideInstruction(name)} />
      <p className="text-[13px] leading-5 text-muted-foreground">
        3. Keep this tab open while Claude works. When Claude adds a file, choose the folder again in the library.
      </p>
    </div>
  )
}

function FolderSteps() {
  const status = useFolderStore((state) => state.status)
  const name = useFolderStore((state) => state.name)
  if (canFollowFolder()) return <ReadOnlySteps />
  if (!canOpenFolder()) {
    return (
      <p className="text-[13px] leading-5 text-muted-foreground">
        This needs Chrome or Edge, which let a website use a folder. In this browser, use the desktop app.
      </p>
    )
  }
  return status === 'open' && name ? <AgentSteps name={name} /> : <OpenFolderSteps />
}

/**
 * Explains on the website the two ways to connect an agent: a folder of the project in this browser, and the desktop
 * app with its MCP server.
 */
export function FolderAgentDialog() {
  const dialogOpen = useAgentStore((state) => state.dialogOpen)
  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => useAgentStore.setState({ dialogOpen: open })}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Connect an agent</DialogTitle>
          <DialogDescription>
            Agents such as Claude Code can read, change and render your diagrams while you watch. An agent sends the
            diagrams that it reads to its model provider, like the rest of your chat with it.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="folder">
          <TabsList>
            <TabsTrigger value="folder">In this browser</TabsTrigger>
            <TabsTrigger value="desktop">Desktop app</TabsTrigger>
          </TabsList>
          <TabsContent value="folder" className="space-y-4 pt-3">
            <BrowserSupportNote />
            <FolderSteps />
          </TabsContent>
          <TabsContent value="desktop" className="pt-3">
            <DesktopSteps />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
