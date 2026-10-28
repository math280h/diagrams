import { Link, type ErrorComponentProps } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { storageCopy } from '@/persistence/storage-copy'
import { errorMessage } from '@/lib/error-message'

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

export function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="max-w-md text-center">
        <p className="text-base font-medium">This page hit an error</p>
        <p className="mt-1 font-mono text-xs break-words text-muted-foreground">{errorMessage(error)}</p>
        <p className="mt-3 text-sm text-muted-foreground">{storageCopy().stillSaved}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="outline" onClick={() => (reset ? reset() : window.location.reload())}>
            Try again
          </Button>
          <Button nativeButton={false} render={<Link to="/" />}>
            Go to all diagrams
          </Button>
        </div>
      </div>
    </div>
  )
}
