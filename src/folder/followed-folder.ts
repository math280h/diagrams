import { toast } from 'sonner'
import { pickFolderFiles } from '@/lib/download'
import { switchRepository } from '@/persistence/bootstrap'
import { localRepository } from '@/persistence/repository'
import { router } from '@/router'
import { useFolderStore } from './folder-store'
import { readFollowedFolder } from './followed-files'
export { canFollowFolder } from './support'

const POLL_MS = 1000

let timer: ReturnType<typeof setInterval> | undefined

/** Asks the user for a folder, then shows its diagram files only to read and follows their changes. */
export async function followFolder() {
  const followed = await readFollowedFolder(await pickFolderFiles())
  if (!followed) {
    toast.error('The folder is empty.', {
      description: 'This browser shows only the diagram files that are in the folder when you choose it.',
    })
    return
  }
  await router.navigate({ to: '/' })
  clearInterval(timer)
  switchRepository(followed.repository)
  useFolderStore.setState({ status: 'following', name: followed.name, problem: null })
  let polling = false
  timer = setInterval(() => {
    if (polling) return
    polling = true
    void followed
      .poll()
      .then((unreadable) => {
        if (unreadable.length === 0) return
        useFolderStore.setState({
          problem: 'This browser cannot read some files of the folder again. Choose the folder again to see them.',
        })
      })
      .finally(() => {
        polling = false
      })
  }, POLL_MS)
}

/** Stops showing the folder and shows the diagrams in this browser again. */
export async function stopFollowing() {
  await router.navigate({ to: '/' })
  clearInterval(timer)
  timer = undefined
  switchRepository(localRepository)
  useFolderStore.setState({ status: 'none', name: null, problem: null })
}
