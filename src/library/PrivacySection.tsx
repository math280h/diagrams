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
    title: 'Stored only on your computer',
    summary:
      'The website keeps your diagrams in this browser, and the desktop app keeps them as files in a folder. No server stores a diagram.',
  },
  {
    icon: Link2,
    title: 'Share links without an upload',
    summary:
      'A share link carries the whole diagram after the #. Browsers never send that part to a website, so only people with the link can open it.',
  },
  {
    icon: ImageDown,
    title: 'Exports made on your device',
    summary: 'Images, videos, GIFs and web pages render in your browser or in the desktop app, not on a server.',
  },
  {
    icon: EyeOff,
    title: 'No account, no tracking',
    summary: 'There is nothing to sign in to, and the app has no analytics, tracking or crash reports.',
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
          A diagram leaves your computer only when you send it: as a link, as a file, or to an agent that you connect.
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
          What goes over the network: the website loads from its server, and on a computer it asks GitHub for the latest
          desktop release to offer the right download. The desktop app asks GitHub for updates. None of these carry a
          diagram. An agent that you connect to the desktop app sends what it reads to its model, like the rest of your
          chat with it.
        </p>
      </div>
    </section>
  )
}
