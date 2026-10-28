import { Link } from '@tanstack/react-router'
import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { DESKTOP_DOWNLOAD_URL, REPOSITORY_URL } from '@/desktop/constants'
import { errorMessage } from '@/lib/error-message'
import { cleanReleaseHtml } from './clean-html'
import { isPreviewSite, loadReleases, type Download, type Release } from './releases'
import type { UnreleasedChanges } from './unreleased'
import { useDocumentTitle } from '@/lib/use-document-title'

type State = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'loaded'; releases: Release[] }

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

function UnreleasedNotes({ changes, downloads }: { changes: UnreleasedChanges; downloads: Download[] }) {
  return (
    <div className="dg-release-notes mt-4">
      <p>The changes on main after {changes.base}. They come in the next release.</p>
      <ul>
        {changes.changes.map((change) => (
          <li key={change.sha}>
            {change.title}{' '}
            <a
              href={
                change.pullRequest === null
                  ? `${REPOSITORY_URL}/commit/${change.sha}`
                  : `${REPOSITORY_URL}/pull/${change.pullRequest}`
              }
              target="_blank"
              rel="noreferrer"
            >
              {change.pullRequest === null ? change.sha.slice(0, 7) : `#${change.pullRequest}`}
            </a>
          </li>
        ))}
      </ul>
      {downloads.length > 0 && (
        <>
          <h3>Try them in the desktop app</h3>
          <p>
            A build of the newest work on main. It does not update itself: download it again for newer changes, or
            install a release to get updates.
          </p>
          <ul>
            {downloads.map((download) => (
              <li key={download.url}>
                <a href={download.url}>{download.label}</a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function ReleaseNotes({ release }: { release: Release }) {
  const notesRef = useRef<HTMLDivElement>(null)
  const notes = useMemo(() => cleanReleaseHtml(release.html), [release.html])
  const empty = !notes.textContent?.trim()

  useLayoutEffect(() => {
    notesRef.current?.replaceChildren(notes.cloneNode(true))
  }, [notes])

  return (
    <article aria-labelledby={`release-${release.tag}`} className="border-b py-8 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`release-${release.tag}`} className="flex items-baseline gap-2 text-xl font-medium tracking-[-0.015em]">
          {release.name}
          {release.preview && (
            <span className="rounded-full border px-2 py-0.5 text-xs font-normal tracking-normal text-muted-foreground">
              Preview
            </span>
          )}
        </h2>
        <time dateTime={new Date(release.publishedAt).toISOString()} className="text-sm text-muted-foreground">
          {DATE_FORMAT.format(release.publishedAt)}
        </time>
      </div>
      {release.unreleased ? (
        <UnreleasedNotes changes={release.unreleased} downloads={release.downloads ?? []} />
      ) : empty ? (
        <p className="mt-4 text-sm text-muted-foreground">This release has no notes.</p>
      ) : (
        <div ref={notesRef} className="dg-release-notes mt-4" />
      )}
      <a
        href={release.url}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        {release.unreleased ? `Compare ${release.unreleased.base} with main on GitHub` : `${release.tag} on GitHub`}{' '}
        <ExternalLink className="size-3.5" />
      </a>
    </article>
  )
}

export function ReleasesPage() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  useDocumentTitle('What’s new')

  useEffect(() => {
    let active = true
    loadReleases().then(
      (releases) => active && setState({ kind: 'loaded', releases }),
      (error: unknown) => active && setState({ kind: 'failed', message: errorMessage(error) }),
    )
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="flex h-full flex-col">
      <header className="dg-titlebar flex h-11 shrink-0 items-center gap-1 border-b bg-panel px-1.5">
        <Button variant="ghost" aria-label="All diagrams" nativeButton={false} render={<Link to="/" />}>
          <ArrowLeft /> <span className="hidden sm:inline">All diagrams</span>
        </Button>
        <Separator orientation="vertical" className="mx-1 h-5 data-vertical:self-center" />
        <span className="px-1 text-sm font-medium tracking-[-0.01em]">What’s new</span>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 pb-24 sm:px-6">
          <div className="pt-8 pb-2 sm:pt-12">
            <h1 className="dg-display text-4xl leading-[1.04] sm:text-5xl">What’s new</h1>
            <p className="mt-4 max-w-xl text-base leading-6 text-pretty text-muted-foreground">
              {isPreviewSite()
                ? 'The changes in each release of Diagrams. This preview site runs main, so it also shows the changes that are not in a release yet.'
                : 'The changes in each release of Diagrams. The website runs the newest release, and the desktop app updates itself to it.'}
            </p>
          </div>
          {state.kind === 'loading' && (
            <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading the release notes…
            </p>
          )}
          {state.kind === 'failed' && (
            <div className="my-8 rounded-md border border-dashed p-4 text-sm">
              <p>The release notes could not be loaded. {state.message}</p>
              <a
                href={`${REPOSITORY_URL}/releases`}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: 'outline', size: 'sm', className: 'mt-3' })}
              >
                Read them on GitHub <ExternalLink />
              </a>
            </div>
          )}
          {state.kind === 'loaded' && state.releases.length === 0 && (
            <p className="py-8 text-sm text-muted-foreground">
              No release is out yet.{' '}
              <a href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noreferrer" className="underline">
                See GitHub Releases
              </a>
              .
            </p>
          )}
          {state.kind === 'loaded' &&
            state.releases.map((release) => <ReleaseNotes key={release.tag} release={release} />)}
        </div>
      </main>
    </div>
  )
}
