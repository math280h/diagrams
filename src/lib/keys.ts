/**
 * Returns the lowercase letter of a key press for letter shortcuts.
 *
 * The function uses the character of the active keyboard layout. If the character is not a Latin
 * letter, for example on a Cyrillic layout, it uses the physical key position.
 *
 * @returns A letter from `a` to `z`, or the lowercase `key` value of the event for other keys.
 */
export function shortcutLetter(event: KeyboardEvent): string {
  if (/^[a-z]$/i.test(event.key)) return event.key.toLowerCase()
  const physical = /^Key([A-Z])$/.exec(event.code)
  if (physical) return physical[1]!.toLowerCase()
  return event.key.toLowerCase()
}
