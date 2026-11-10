import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { AppMark } from '@/components/AppMark'
import { DESKTOP_DOWNLOAD_URL, REPOSITORY_URL } from '@/desktop/constants'

type FooterLink = { label: string; to: '/releases' } | { label: string; href: string }

const GROUPS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'App',
    links: [
      { label: 'What’s new', to: '/releases' },
      { label: 'Get the desktop app', href: DESKTOP_DOWNLOAD_URL },
    ],
  },
  {
    title: 'Open source',
    links: [
      { label: 'Source code on GitHub', href: REPOSITORY_URL },
      { label: 'Report a problem', href: `${REPOSITORY_URL}/issues/new/choose` },
      { label: 'Contribute', href: `${REPOSITORY_URL}/blob/main/CONTRIBUTING.md` },
    ],
  },
  {
    title: 'Trust',
    links: [
      { label: 'Security policy', href: `${REPOSITORY_URL}/security/policy` },
      { label: 'Release signing key', href: '/release-signing-key.asc' },
      { label: 'MIT licence', href: `${REPOSITORY_URL}/blob/main/LICENSE` },
      { label: 'Third-party licences', href: '/third-party-licenses.txt' },
    ],
  },
]

const LINK_CLASS = 'inline-flex items-center gap-1 hover:text-foreground hover:underline'

function FooterItem({ link }: { link: FooterLink }) {
  if ('to' in link) {
    return (
      <Link to={link.to} className={LINK_CLASS}>
        {link.label}
      </Link>
    )
  }
  const external = link.href.startsWith('https://')
  return (
    <a href={link.href} className={LINK_CLASS} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
      {link.label}
      {external && <ArrowUpRight aria-hidden className="size-3.5" />}
    </a>
  )
}

/** Shows the website footer: what Diagrams is, and links to the releases, the source code and the legal texts. */
export function SiteFooter() {
  return (
    <footer className="mt-16 grid gap-8 border-t pt-8 text-[13px] text-muted-foreground sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]">
      <div className="max-w-xs space-y-2">
        <p className="flex items-center gap-2 text-[15px] font-medium tracking-[-0.02em] text-foreground">
          <AppMark className="size-5 shrink-0" /> Diagrams
        </p>
        <p className="leading-5">Architecture diagrams and user flows that move. Free, no account, nothing uploaded.</p>
      </div>
      {GROUPS.map((group) => (
        <nav key={group.title} aria-label={group.title} className="space-y-2">
          <p className="font-medium text-foreground">{group.title}</p>
          <ul className="space-y-1.5">
            {group.links.map((link) => (
              <li key={link.label}>
                <FooterItem link={link} />
              </li>
            ))}
          </ul>
        </nav>
      ))}
    </footer>
  )
}
