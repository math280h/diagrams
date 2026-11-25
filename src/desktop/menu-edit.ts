import type { EditCommand } from './contract'

type EditHandler = (command: EditCommand) => boolean

let handler: EditHandler | null = null

/**
 * Sets the handler of the menu bar edit commands. It returns true if it ran the command.
 *
 * @returns A function that removes the handler.
 */
export function handleMenuEdit(next: EditHandler): () => void {
  handler = next
  return () => {
    if (handler === next) handler = null
  }
}

/** Runs an edit command of the menu bar, and returns false if no handler ran it. */
export function runMenuEdit(command: EditCommand): boolean {
  return handler?.(command) ?? false
}
