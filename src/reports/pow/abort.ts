/** Returns the error of a proof of work that a signal stopped. */
export function abortError(): DOMException {
  return new DOMException('The proof of work stopped.', 'AbortError')
}
