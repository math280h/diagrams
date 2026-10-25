import type { Diagram } from '@/model/schema'
import { localRepository, type DiagramRepository } from './repository'

let active: DiagramRepository = localRepository

/** Returns the repository of this build: local storage on the web, files on the desktop. */
export function repository(): DiagramRepository {
  return active
}

/** Replaces the repository. Call it once, before the app renders. */
export function setRepository(next: DiagramRepository) {
  active = next
}

/** Loads a diagram. Returns `null` if the diagram does not exist or the stored data is not valid. */
export function loadDiagramOrNull(id: string): Diagram | null {
  try {
    return active.load(id)
  } catch {
    return null
  }
}
