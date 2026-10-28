import { useEffect } from 'react'

const APP_NAME = 'Diagrams'

/**
 * Sets the title of the browser tab to the name and the app name while the component shows, and puts the earlier
 * title back after it.
 *
 * @param name - The page name, for example a diagram name. Without it, the title does not change.
 */
export function useDocumentTitle(name: string | null | undefined) {
  useEffect(() => {
    if (!name) return
    const previous = document.title
    document.title = `${name} – ${APP_NAME}`
    return () => {
      document.title = previous
    }
  }, [name])
}
