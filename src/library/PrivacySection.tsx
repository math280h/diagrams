import { EyeOff, HardDrive, ImageDown, Link2, type LucideIcon } from 'lucide-react'
import { cn } from 'cn'

interface PrivacyPoint {
  icon: LucideIcon
  title: string
  summary: string
}

const POINTS: readonly PrivacyPoint[] = [
  {
    icon: HardDrive,
    title: 'No server stores your diagrams',
    summary: 'The website keeps them in your browser. The desktop app saves them as files on your disk.',
  },
  {
    icon: Link2,
    title: 'Share links without an upload',
    summary:
      'A share link carries the whole diagram after the # in the address. Browsers do not send that part to a server, so the website never receives the diagram.',
  },
  {
    icon: ImageDown,
    title: 'Exports made on your device',
    summary: 'Images, videos, GIFs and web pages render in your browser or in the desktop app, not on a server.',
  },
  {
    icon: EyeOff,
    title: 'No account, no tracking',
    summary: 'There is nothing to sign in to. The app sends no analytics, telemetry or crash reports.',
  },
]

/** Tells that diagrams stay on the computer of the user, and lists the network connections that the app makes. */
export function PrivacySection({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="privacy-heading"
      className={cn('grid gap-8 border-t pt-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]', className)}
    >
      <div>
        <h2 id="privacy-heading" className="dg-display text-3xl leading-[1.1] sm:text-4xl">
          Your diagrams stay on your computer
        </h2>
        <p className="mt-3 text-base leading-6 text-pretty text-muted-foreground">
          A diagram leaves your computer only when you send it as a link or a file, or let a connected agent read it.
        </p>
      </div>
      <div>
        <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {POINTS.map(({ icon: Icon, title, summary }) => (
            <li key={title}>
              <h3 className="flex items-center gap-2 text-[15px] font-medium tracking-[-0.01em]">
                <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                {title}
              </h3>
              <p className="mt-1.5 text-[13px] leading-5 text-pretty text-muted-foreground">{summary}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 border-t pt-4 text-[13px] leading-5 text-pretty text-muted-foreground">
          A few requests do go over the network. The website loads from its host. On a computer, it also asks GitHub for
          the latest release to offer the right desktop download. The desktop app asks GitHub for updates. None of these
          requests carry a diagram. An agent that you connect to the desktop app sends what it reads to its model
          provider, like the rest of your chat with it.
        </p>
      </div>
    </section>
  )
}
