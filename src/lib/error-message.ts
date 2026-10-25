/** Returns the message of a thrown value, also of a value that is not an `Error`. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
