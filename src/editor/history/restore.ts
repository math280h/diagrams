import { toast } from 'sonner'
import { versionStore, type VersionMeta } from '@/persistence/version-store'
import { restoreContent } from '@/store/actions'
import { flushPendingSave } from '@/store/document'
import { undo } from '@/store/history'
import { asVersionAuthor, previewVersion, useVersions } from '@/store/versions'
import { versionMoment } from './format'

/** Replaces the open diagram with a version as one undo step, then shows the current diagram again. */
export async function restoreVersion(meta: VersionMeta) {
  const { preview } = useVersions.getState()
  const diagram = preview?.id === meta.id ? preview.diagram : await versionStore().load(meta.id)
  if (!diagram) {
    toast.error('This version is no longer in the history.')
    return
  }
  asVersionAuthor({ author: 'restore', restoredAt: meta.at }, () => {
    restoreContent(diagram)
    flushPendingSave()
  })
  previewVersion(null)
  toast.success(`Restored the version from ${versionMoment(meta.at)}`, { action: { label: 'Undo', onClick: undo } })
}
