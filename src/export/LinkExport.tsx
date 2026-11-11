import { Copy, ExternalLink, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAppSettings } from '@/desktop/app-settings'
import { isDesktop } from '@/desktop/bridge'
import { BUILD } from '@/desktop/build-config'
import { errorMessage } from '@/lib/error-message'
import { encodeShareData, LONG_LINK_CHARS, shareUrl } from '@/share/share-link'
import { currentDiagram } from '@/store/document'

type State = { kind: 'working' } | { kind: 'failed'; message: string } | { kind: 'ready'; data: string }

function siteBase(shareWebsite: string | undefined): string {
  if (!isDesktop()) return `${window.location.origin}${window.location.pathname}`
  return `${shareWebsite ?? BUILD.website}/`
}

export function LinkExport() {
  const [state, setState] = useState<State>({ kind: 'working' })
  const shareWebsite = useAppSettings((settings) => settings.settings?.shareWebsite)

  useEffect(() => {
    let active = true
    encodeShareData(currentDiagram()).then(
      (data) => active && setState({ kind: 'ready', data }),
      (error: unknown) => active && setState({ kind: 'failed', message: errorMessage(error) }),
    )
    return () => {
      active = false
    }
  }, [])
  const link = state.kind === 'ready' ? shareUrl(siteBase(shareWebsite), state.data) : ''

  const copy = (url: string) =>
    void navigator.clipboard.writeText(url).then(
      () => toast.success('Copied the share link'),
      () => toast.error('Could not copy. Select the link and copy it.'),
    )

  return (
    <>
      <div className="space-y-3 text-sm">
        {state.kind === 'working' && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Making the link…
          </p>
        )}
        {state.kind === 'failed' && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">{state.message}</p>
        )}
        {state.kind === 'ready' && (
          <>
            <Input
              readOnly
              value={link}
              aria-label="Share link"
              spellCheck={false}
              onFocus={(event) => event.currentTarget.select()}
              className="font-mono text-xs md:text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {link.length.toLocaleString()} characters.
              {link.length > LONG_LINK_CHARS &&
                ' Some chat apps and mail programs cut links this long. A web page export works at any size.'}
            </p>
          </>
        )}
        <p className="text-muted-foreground">
          The whole diagram is in the link, so nothing is uploaded. Anyone with the link can play the diagram and save a
          copy. Changes that you make after you copy the link are not in it.
        </p>
      </div>
      <DialogFooter>
        {state.kind === 'ready' && (
          <>
            <Button variant="outline" nativeButton={false} render={<a href={link} target="_blank" rel="noreferrer" />}>
              <ExternalLink /> Open
            </Button>
            <Button onClick={() => copy(link)}>
              <Copy /> Copy link
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  )
}
