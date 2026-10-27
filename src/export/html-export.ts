import type { LucideIconData } from 'lucide-react'
import { BUNDLED_ICON_NAMES } from '@/canvas/icon-cache'
import { iconSourceOf, loadIconSet, type IconEntry, type IconSourceId } from '@/canvas/icons/library'
import type { Diagram } from '@/model/schema'
import { PLAYER_FILES } from '@/standalone/files'
import type { PageIcons } from '@/standalone/page-data'
import { fontFaceRule, pageHtml } from './html-page'
import { pageFontFamilies, type FontFamily } from './page-fonts'

const LICENSE_SEPARATOR = '='.repeat(80)

/** Returns the icon names that the nodes and the flow tokens of a diagram use. */
export function diagramIconNames(diagram: Diagram): Set<string> {
  const names = new Set<string>()
  for (const node of diagram.nodes) if ('icon' in node.data && node.data.icon) names.add(node.data.icon)
  for (const flow of diagram.flows) if (flow.token.icon) names.add(flow.token.icon)
  return names
}

// Each icon module of lucide-react exports its icon data under this name.
const LUCIDE_ICON_DATA_EXPORT = '__iconData'

function isIconData(value: unknown): value is LucideIconData {
  return typeof value === 'object' && value !== null && Array.isArray((value as { node?: unknown }).node)
}

async function lucideIconData(name: string): Promise<LucideIconData | null> {
  const { dynamicIconImports } = await import('lucide-react/dynamic')
  const load = dynamicIconImports[name as keyof typeof dynamicIconImports]
  if (!load) return null
  const module: Record<string, unknown> = await load()
  const data = module[LUCIDE_ICON_DATA_EXPORT]
  return isIconData(data) ? data : null
}

async function pageIcons(diagram: Diagram): Promise<PageIcons> {
  const bySource = new Map<IconSourceId, string[]>()
  const lucide: string[] = []
  for (const name of diagramIconNames(diagram)) {
    const source = iconSourceOf(name)
    if (source) bySource.set(source, [...(bySource.get(source) ?? []), name])
    else if (!BUNDLED_ICON_NAMES.has(name)) lucide.push(name)
  }
  const sets = await Promise.all(
    [...bySource].map(async ([source, names]) => {
      const set = await loadIconSet(source)
      const entries = names.map((name) => set.byId.get(name)).filter((entry): entry is IconEntry => !!entry)
      const art = Object.fromEntries(
        entries.flatMap((entry) => (entry.art && set.art[entry.art] ? [[entry.art, set.art[entry.art]!]] : [])),
      )
      return { source, entries, art }
    }),
  )
  const icons = await Promise.all(lucide.map(async (name) => [name, await lucideIconData(name)] as const))
  return {
    sets,
    lucide: Object.fromEntries(icons.filter((icon): icon is [string, LucideIconData] => icon[1] !== null)),
  }
}

async function fetchText(path: string): Promise<string> {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`)
  if (!response.ok) throw new Error(`The player file ${path} could not be loaded (${response.status}).`)
  return response.text()
}

async function dataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result.replace(/^data:[^;,]*/, 'data:font/woff2'))
        : reject(new Error(`The font ${url} could not be read.`))
    reader.onerror = () => reject(reader.error ?? new Error(`The font ${url} could not be read.`))
    reader.readAsDataURL(blob)
  })
}

async function fontCss(families: readonly FontFamily[]): Promise<string> {
  const rules = await Promise.all(
    families.flatMap((family) =>
      family.files.map(async (file) => fontFaceRule({ ...file, dataUrl: await dataUrl(file.url) })),
    ),
  )
  return rules.join('\n')
}

function fontLicenses(families: readonly FontFamily[]): string {
  return families
    .map((family) => [LICENSE_SEPARATOR, `Font: ${family.files[0]!.family}`, '', family.license.trim()].join('\n'))
    .join('\n\n')
}

/** Makes an HTML page that plays the diagram and its flows with no network connection and no other files. */
export async function exportHtmlPage(diagram: Diagram): Promise<Blob> {
  const families = pageFontFamilies(diagram.theme.fonts)
  const [script, style, playerLicenses, icons, fonts] = await Promise.all([
    fetchText(PLAYER_FILES.script),
    fetchText(PLAYER_FILES.style),
    fetchText(PLAYER_FILES.licenses),
    pageIcons(diagram),
    fontCss(families),
  ])
  const html = pageHtml({
    diagram,
    icons,
    script,
    style,
    fontCss: fonts,
    licenses: `${playerLicenses.trim()}\n\n${fontLicenses(families)}\n`,
  })
  return new Blob([html], { type: 'text/html' })
}
