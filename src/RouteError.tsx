import { Link, type ErrorComponentProps } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import { rememberProblem } from '@/reports/recent-problems'
import { MoreDetails } from '@/components/MoreDetails'
import { Button } from '@/components/ui/button'
import { storageCopy } from '@/persistence/storage-copy'
import { errorMessage } from '@/lib/error-message'
import { errorProblem } from '@/lib/problem-report'
import { FileLoadError } from '@/new-version/file-load'
import { showProblem } from '@/store/problem-store'

export function RouteNotFound() {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="max-w-md text-center">
        <p className="text-base font-medium">This page does not exist</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The address may be old or mistyped. {storageCopy().stillSaved}
        </p>
        <Button className="mt-5" nativeButton={false} render={<Link to="/" />}>
          Go to all diagrams
        </Button>
      </div>
    </div>
  )
}

const PAGE_ERROR = 'This page hit an error'
const PAGE_NOT_LOADED = 'Could not load this page'

function pageWithoutIds() {
  return `/${window.location.hash.split('/')[1] ?? ''}`
}

export function RouteError({ error, reset }: ErrorComponentProps) {
  const notLoaded = error instanceof FileLoadError
  const title = notLoaded ? PAGE_NOT_LOADED : PAGE_ERROR
  const problem = useMemo(() => errorProblem(title, error, [`Page: ${pageWithoutIds()}`]), [title, error])
  useEffect(() => rememberProblem(problem), [problem])
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="max-w-md text-center">
        <p className="text-base font-medium">{title}</p>
        {notLoaded ? (
          <p className="mt-1 text-sm text-pretty text-muted-foreground">{error.message}</p>
        ) : (
          <p className="mt-1 font-mono text-xs break-words text-muted-foreground">{errorMessage(error)}</p>
        )}
        <MoreDetails onClick={() => showProblem(problem)} />
        <p className="mt-3 text-sm text-muted-foreground">{storageCopy().stillSaved}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="outline" onClick={() => (!notLoaded && reset ? reset() : window.location.reload())}>
            {notLoaded ? 'Reload' : 'Try again'}
          </Button>
          <Button nativeButton={false} render={<Link to="/" />}>
            Go to all diagrams
          </Button>
        </div>
      </div>
    </div>
  )
}
