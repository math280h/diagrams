import { Copy, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react'
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { GitHubMark } from '@/components/GitHubMark'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { addWebsite, removeWebsite, setShareWebsite, useAppSettings } from './app-settings'
import { BUILD, releaseLinks, repositoryName, websiteOrigin } from './build-config'
import { cancelGitHubSignIn, signInToGitHub, signOutOfGitHub, useGitHubSignIn } from './github-sign-in'
import { KeepRunningSetting } from './KeepRunningSetting'
import { useDesktopSettingsDialog } from './settings-dialog'
import { checkForUpdates, setUpdateRepository, useUpdateInfo } from './updates'

function Section({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="space-y-3 border-t pt-4 text-[13px]">
      <div className="space-y-0.5">
        <h3 id={headingId} className="font-medium text-foreground">
          {title}
        </h3>
        <p className="leading-5 text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}

function Problem({ id, message }: { id: string; message: string | null }) {
  if (!message) return null
  return (
    <p id={id} className="text-destructive">
      {message}
    </p>
  )
}

function Websites() {
  const settings = useAppSettings((state) => state.settings)
  const [address, setAddress] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const problemId = useId()
  const shareLabelId = useId()
  if (!settings) return null

  const add = async (event: FormEvent) => {
    event.preventDefault()
    const origin = websiteOrigin(address)
    if (!origin) {
      setProblem('Enter a website address that starts with https://, or http:// for this computer.')
      return
    }
    if (settings.websites.includes(origin)) {
      setProblem(`${origin} is in the list already.`)
      return
    }
    if (await addWebsite(origin)) {
      setAddress('')
      setProblem(null)
    }
  }

  return (
    <Section
      title="Websites"
      description="“Open in desktop app” works only on these websites. Share links open on the website that you choose."
    >
      <ul aria-label="Websites" className="divide-y rounded-lg border">
        {settings.websites.map((website) => (
          <li key={website} className="flex items-center gap-2 py-1 pr-1 pl-3">
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={website}>
              {website}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${website}`}
              disabled={settings.websites.length === 1}
              onClick={() => void removeWebsite(website)}
            >
              <X />
            </Button>
          </li>
        ))}
      </ul>
      <form onSubmit={(event) => void add(event)} className="flex gap-2">
        <Input
          value={address}
          onChange={(event) => {
            setAddress(event.target.value)
            setProblem(null)
          }}
          placeholder="https://diagrams.example.com"
          aria-label="Website address"
          aria-invalid={problem !== null}
          aria-describedby={problem ? problemId : undefined}
          spellCheck={false}
          autoComplete="off"
          className="font-mono text-xs md:text-xs"
        />
        <Button type="submit" variant="outline" disabled={!address.trim()}>
          Add
        </Button>
      </form>
      <Problem id={problemId} message={problem} />
      <div className="flex items-center justify-between gap-4">
        <span id={shareLabelId} className="shrink-0 text-muted-foreground">
          Share links open on
        </span>
        <Select<string>
          value={settings.shareWebsite}
          onValueChange={(website) => website !== null && void setShareWebsite(website)}
          items={settings.websites.map((website) => ({ value: website, label: website }))}
        >
          <SelectTrigger size="sm" aria-labelledby={shareLabelId} className="min-w-0 rounded-lg px-2 text-xs">
            <SelectValue className="min-w-0 truncate font-mono" />
          </SelectTrigger>
          <SelectContent align="end" alignItemWithTrigger={false}>
            {settings.websites.map((website) => (
              <SelectItem key={website} value={website} className="font-mono text-xs">
                {website}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Section>
  )
}

function UpdateRepository({ repository }: { repository: string }) {
  const [text, setText] = useState(repository)
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inputId = useId()
  const problemId = useId()

  const save = async (next: string | null) => {
    setSaving(true)
    const failure = await setUpdateRepository(next)
    setSaving(false)
    setProblem(failure)
    if (failure === null && next === null) setText(BUILD.repository)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const name = repositoryName(text)
    if (!name) {
      setProblem('Enter a GitHub repository as owner/name.')
      return
    }
    if (name !== repository) void save(name)
  }

  return (
    <div className="space-y-2">
      <form onSubmit={submit} className="space-y-1.5">
        <label htmlFor={inputId} className="text-muted-foreground">
          Update source
        </label>
        <div className="flex gap-2">
          <Input
            id={inputId}
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setProblem(null)
            }}
            placeholder="owner/name"
            aria-invalid={problem !== null}
            aria-describedby={problem ? problemId : undefined}
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-xs md:text-xs"
          />
          <Button type="submit" variant="outline" disabled={saving || !text.trim()}>
            {saving && <Loader2 className="animate-spin" />} Save
          </Button>
        </div>
      </form>
      <Problem id={problemId} message={problem} />
      {repository !== BUILD.repository && !saving && (
        <Button variant="link" size="sm" className="h-auto p-0 text-[13px]" onClick={() => void save(null)}>
          Use {BUILD.repository} again
        </Button>
      )}
    </div>
  )
}

function GitHubSignInSetting() {
  const info = useGitHubSignIn((state) => state.info)
  if (!info) return null
  if (info.state === 'signed-in') {
    return (
      <div className="flex items-start justify-between gap-4">
        <p className="leading-5 text-muted-foreground">
          {info.kept
            ? 'Signed in to GitHub.'
            : 'Signed in to GitHub until the app quits. This system has no keychain to store the sign-in.'}
        </p>
        <Button variant="ghost" size="sm" onClick={() => void signOutOfGitHub()}>
          Sign out
        </Button>
      </div>
    )
  }
  if (info.state === 'waiting') {
    const copy = () =>
      void navigator.clipboard.writeText(info.userCode).then(
        () => toast.success('Copied the code'),
        () => toast.error('Could not copy. Select the code and copy it.'),
      )
    return (
      <div className="space-y-3 rounded-lg border p-3">
        <p className="leading-5">Enter this code on GitHub to sign in:</p>
        <p className="font-mono text-lg select-all">{info.userCode}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => window.open(info.verificationUri, '_blank', 'noreferrer')}>
            <ExternalLink /> Open GitHub
          </Button>
          <Button size="sm" variant="outline" onClick={copy}>
            <Copy /> Copy code
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void cancelGitHubSignIn()}>
            Cancel
          </Button>
        </div>
        <p role="status" className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Waiting for GitHub…
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="leading-5 text-muted-foreground">
        The updates are in a private repository. Sign in to GitHub with an account that can read it.
      </p>
      {info.message && <p className="text-destructive">{info.message}</p>}
      <Button size="sm" variant="outline" onClick={() => void signInToGitHub()}>
        <GitHubMark className="size-3.5" /> Sign in to GitHub
      </Button>
    </div>
  )
}

function Updates() {
  const info = useUpdateInfo((state) => state.info)
  if (!info) return null
  const description =
    info.state === 'unsupported' ? (
      `Version ${info.currentVersion}. This build does not update itself.`
    ) : (
      <>
        Version {info.currentVersion}. Updates come from the releases of{' '}
        <a
          href={releaseLinks(info.repository).releases}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs text-foreground underline-offset-4 hover:underline"
        >
          {info.repository}
        </a>{' '}
        on GitHub.
      </>
    )
  return (
    <Section title="Updates" description={description}>
      {BUILD.repositoryEditable && <UpdateRepository key={info.repository} repository={info.repository} />}
      {BUILD.githubApp && <GitHubSignInSetting />}
      <Button variant="outline" size="sm" onClick={() => void checkForUpdates()}>
        <RefreshCw /> Check for updates
      </Button>
    </Section>
  )
}

/** Shows the settings of the desktop app: the websites, background running and updates. */
export function DesktopSettingsDialog() {
  const open = useDesktopSettingsDialog((state) => state.open)
  return (
    <Dialog open={open} onOpenChange={(next) => useDesktopSettingsDialog.setState({ open: next })}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>App settings</DialogTitle>
          <DialogDescription>These settings are for the app on this computer.</DialogDescription>
        </DialogHeader>
        <Websites />
        <KeepRunningSetting />
        <Updates />
      </DialogContent>
    </Dialog>
  )
}
