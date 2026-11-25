/**
 * Maps an icon name that an earlier release wrote, and that Lucide or the icon sets no longer have, to the name of the
 * same icon now.
 *
 * @example
 * ```ts
 * { 'alert-triangle': 'triangle-alert', 'logo:oldslug': 'logo:newslug' }
 * ```
 */
export const ICON_ALIASES: Readonly<Record<string, string>> = {}

/** Returns the name that the app now has for an icon. A name without an alias stays the same. */
export function currentIconName(name: string, aliases: Readonly<Record<string, string>> = ICON_ALIASES): string {
  return Object.hasOwn(aliases, name) ? aliases[name]! : name
}
