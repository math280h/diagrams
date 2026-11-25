import type { KeptLogo } from './sources.ts'

/** A logo as the Simple Icons package exports it. */
export interface PackageLogo {
  slug: string
  title: string
  path: string
  source: string
  license?: { type: string; url?: string }
}

/** A category of `LOGOS` in `catalog.mjs`: the card form and the slugs, split by spaces. */
export interface LogoCategory {
  form: string
  slugs: string
}

/** An entry of `src/canvas/icons/data/logos.json`. */
export interface LogoEntry {
  id: string
  title: string
  category: string
  form: string
  aliases: string[]
  keywords: string[]
  path: string
  retired?: true
}

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Returns the logos of a Simple Icons package module, by slug. */
export function logosBySlug(module: Readonly<Record<string, unknown>>): Map<string, PackageLogo> {
  const bySlug = new Map<string, PackageLogo>()
  for (const icon of Object.values(module)) {
    if (icon && typeof icon === 'object' && 'slug' in icon) bySlug.set((icon as PackageLogo).slug, icon as PackageLogo)
  }
  return bySlug
}

function catalogSlugs(catalog: Readonly<Record<string, LogoCategory>>): string[] {
  return Object.values(catalog).flatMap(({ slugs }) => slugs.split(/\s+/))
}

/**
 * Returns the kept logos with the catalog logos that the package no longer has, from an earlier package version.
 *
 * @param version - The earlier Simple Icons version.
 * @throws Error If the earlier version also does not have a missing logo.
 */
export function withKeptLogos(
  catalog: Readonly<Record<string, LogoCategory>>,
  current: ReadonlyMap<string, PackageLogo>,
  kept: Readonly<Record<string, KeptLogo>>,
  earlier: ReadonlyMap<string, PackageLogo>,
  version: string,
): Record<string, KeptLogo> {
  const result = { ...kept }
  for (const slug of catalogSlugs(catalog)) {
    if (current.has(slug) || result[slug]) continue
    const icon = earlier.get(slug)
    if (!icon) throw new Error(`Simple Icons ${version} has no ${slug} either.`)
    result[slug] = {
      version,
      title: icon.title,
      path: icon.path,
      source: icon.source,
      ...(icon.license && { license: icon.license }),
    }
  }
  return Object.fromEntries(Object.entries(result).toSorted(([a], [b]) => (a < b ? -1 : 1)))
}

/**
 * Returns the entries of the logo set. A logo that the package no longer has comes from the kept logos and is
 * retired.
 *
 * @param aliases - The extra import names of a slug, split by `|`.
 * @throws Error If the package and the kept logos both do not have a slug of the catalog.
 */
export function logoEntries(
  catalog: Readonly<Record<string, LogoCategory>>,
  aliases: Readonly<Record<string, string>>,
  current: ReadonlyMap<string, PackageLogo>,
  kept: Readonly<Record<string, KeptLogo>>,
): LogoEntry[] {
  const entries: LogoEntry[] = []
  for (const [category, { form, slugs }] of Object.entries(catalog)) {
    for (const slug of slugs.split(/\s+/)) {
      const icon = current.get(slug) ?? kept[slug]
      if (!icon) {
        throw new Error(
          `Simple Icons has no ${slug}. If an earlier version had it, run pnpm icons logos --keep-from <that version>. ` +
            'See "Keep icon names" in docs/RELEASING.md.',
        )
      }
      entries.push({
        id: `logo:${slug}`,
        title: icon.title,
        category,
        form,
        aliases: [...new Set([slug, icon.title.toLowerCase(), ...(aliases[slug]?.split('|') ?? [])])],
        keywords: [...new Set([slug, ...words(icon.title)])],
        path: icon.path,
        ...(!current.has(slug) && { retired: true as const }),
      })
    }
  }
  return entries
}
