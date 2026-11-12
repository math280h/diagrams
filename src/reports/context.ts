import { desktopApi } from '@/desktop/bridge'
import { repository } from '@/persistence/active-repository'
import { isPreviewSite } from '@/releases/releases'
import { takeSnapshot, type DocSnapshot } from '@/store/doc-store'
import type { ReportContext } from './build'
import { diagramTexts } from './diagram-texts'
import { createRedactor } from './redact'
import type { OperatingSystem } from './report'

const PAGE_KINDS: Record<string, string> = {
  '': 'library',
  d: 'editor',
  p: 'player',
  t: 'template',
  releases: 'releases',
  s: 'shared link',
}

const BROWSERS: readonly [name: string, pattern: RegExp][] = [
  ['Edge', /\bEdg\/(\d+)/],
  ['Firefox', /\bFirefox\/(\d+)/],
  ['Chrome', /\b(?:Headless)?Chrome\/(\d+)/],
  ['Safari', /\bVersion\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari\//],
]

const SYSTEMS: readonly [os: OperatingSystem, pattern: RegExp][] = [
  ['windows', /\bWindows\b/],
  ['android', /\bAndroid\b/],
  ['ios', /\b(?:iPhone|iPad|iPod)\b/],
  ['macos', /\bMac OS X\b|\bMacintosh\b/],
  ['linux', /\bLinux\b|\bX11\b/],
]

/** Returns the kind of a page from its address, such as `editor`, without the id of the diagram. */
export function pageKind(hash: string): string {
  const segment = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? ''
  return PAGE_KINDS[segment] ?? 'other'
}

/** Returns the browser and its major version, such as `Chrome 142`, from a user agent text. */
export function browserName(userAgent: string): string {
  for (const [name, pattern] of BROWSERS) {
    const version = pattern.exec(userAgent)?.[1]
    if (version) return `${name} ${version}`
  }
  return 'Other browser'
}

/** Returns the operating system of a user agent text. */
export function operatingSystem(userAgent: string): OperatingSystem {
  return SYSTEMS.find(([, pattern]) => pattern.test(userAgent))?.[0] ?? 'other'
}

/** Returns the release channel of the app: `development`, `preview`, `pre-release` or `release`. */
function releaseChannel(version: string): string {
  if (import.meta.env.DEV) return 'development'
  if (isPreviewSite() || version.includes('-preview.')) return 'preview'
  return version.includes('-') ? 'pre-release' : 'release'
}

/**
 * Returns the facts of this app for a problem report, and a function that removes private values from a text. The
 * private values are the texts of the open diagram, the names of the diagrams, and on the desktop the folders, the
 * names and the secrets that the main process knows.
 *
 * @param diagrams - Other diagrams whose texts the report must not hold, such as the diagram open at the problem.
 */
export async function reportContext(diagrams: readonly DocSnapshot[] = []): Promise<ReportContext> {
  const desktop = desktopApi()
  const info = desktop ? await desktop.request('reports.context', null) : null
  const userAgent = navigator.userAgent
  const sensitive = [
    ...(info?.sensitive ?? []),
    ...[takeSnapshot(), ...diagrams].flatMap((diagram) => diagramTexts(diagram)),
    ...repository()
      .list()
      .map((meta) => meta.name),
  ]
  return {
    app: {
      version: info?.version ?? '',
      surface: desktop ? 'desktop' : 'website',
      channel: releaseChannel(info?.version ?? ''),
    },
    system: {
      os: info?.os ?? operatingSystem(userAgent),
      browser: browserName(userAgent),
      electron: info?.electron ?? '',
    },
    page: pageKind(window.location.hash),
    time: new Date(),
    redact: createRedactor(sensitive),
  }
}
