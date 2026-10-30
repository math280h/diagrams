import { ArrowUpRight, Download } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { DESKTOP_DOWNLOAD_URL } from './constants'
import { SYSTEM_NAMES, useDesktopDownload } from './download'

/**
 * Starts the download of the desktop app for this system, or opens the release page if no installer fits.
 *
 * @param allDownloads - If true, a direct download also gets a link to the release page.
 */
export function DesktopDownloadLink({
  variant,
  allDownloads = false,
}: {
  variant: 'secondary' | 'ghost'
  allDownloads?: boolean
}) {
  const { url, system } = useDesktopDownload()
  if (!system) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={buttonVariants({ variant })}>
        Get the desktop app <ArrowUpRight />
      </a>
    )
  }
  return (
    <>
      <a href={url} className={buttonVariants({ variant })}>
        <Download /> Download for {SYSTEM_NAMES[system]}
      </a>
      {allDownloads && (
        <a
          href={DESKTOP_DOWNLOAD_URL}
          target="_blank"
          rel="noreferrer"
          className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          All downloads
        </a>
      )}
    </>
  )
}
