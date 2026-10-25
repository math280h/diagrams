/** Adds the warnings to a tool result, if there are any. */
export function withWarnings<T extends object>(result: T, warnings: readonly string[]) {
  return warnings.length > 0 ? { ...result, warnings } : result
}
