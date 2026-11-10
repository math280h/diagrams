import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { repository } from '@/persistence/active-repository'
import { closeFolder, pickFolder, reopenFolder, useFolderStore } from './folder-store'
import { canFollowFolder, followFolder, stopFollowing } from './followed-folder'
import { canOpenFolder } from './support'

function Action({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <Button variant="link" size="xs" className="px-0" onClick={onClick}>
      {children}
    </Button>
  )
}

/**
 * Offers a folder for the diagrams on the website, or the folder of the last visit when the browser asks again. A
 * browser without folder access gets the offer to show a folder only to read.
 *
 * @param offer - If false, it shows only the folder of the last visit, not the offer of a new folder.
 */
export function FolderOffer({ offer = true }: { offer?: boolean }) {
  const status = useFolderStore((state) => state.status)
  const name = useFolderStore((state) => state.name)
  const problem = useFolderStore((state) => state.problem)
  if (canFollowFolder() && offer) {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[13px] text-muted-foreground">
        <span>
          Or show a folder only to read, for example to watch Claude Code change its diagram files. This browser cannot
          save to a folder.
        </span>
        <Action onClick={() => void followFolder()}>Show a folder</Action>
      </p>
    )
  }
  if (!canOpenFolder()) return null
  if (status === 'needs-permission' || status === 'missing') {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[13px] text-muted-foreground">
        <span className="min-w-0 break-all">
          {status === 'missing'
            ? `The folder “${name}” is gone or cannot be read${problem ? `: ${problem}` : '.'}`
            : `Your diagrams were in the folder “${name}”.`}
        </span>
        {status === 'needs-permission' && <Action onClick={() => void reopenFolder()}>Open it again</Action>}
        <Action onClick={() => void pickFolder()}>Choose a folder</Action>
        <Action onClick={() => void closeFolder()}>Stay in this browser</Action>
      </p>
    )
  }
  if (!offer) return null
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[13px] text-muted-foreground">
      <span>Or keep the diagrams as files in a folder, for example in a project that Claude Code works on.</span>
      <Action onClick={() => void pickFolder()}>Open a folder</Action>
    </p>
  )
}

/** Shows the folder that holds the diagrams on the website, with a way back to the diagrams in this browser. */
export function FolderStorageNote({ name, className = 'mt-4' }: { name: string; className?: string }) {
  const problem = useFolderStore((state) => state.problem)
  return (
    <div className={cn('space-y-1 text-[13px] text-muted-foreground', className)}>
      <p className="flex flex-wrap items-center gap-x-3">
        <span className="min-w-0 break-all">
          Saved as files in the folder <span className="font-mono">{name}</span>
        </span>
        <Action onClick={() => void closeFolder()}>Close folder</Action>
      </p>
      {problem && <p className="text-destructive">{problem}</p>}
    </div>
  )
}

/** Shows the folder that this browser only reads, with what that means and a way back to the diagrams here. */
export function FollowedFolderNote({ name, className = 'mt-4' }: { name: string; className?: string }) {
  const problem = useFolderStore((state) => state.problem)
  return (
    <div className={cn('space-y-1 text-[13px] text-muted-foreground', className)}>
      <p className="flex flex-wrap items-center gap-x-3">
        <span className="min-w-0 break-all">
          Showing the folder <span className="font-mono">{name}</span> only to read
        </span>
        <Action onClick={() => void followFolder()}>Choose it again</Action>
        <Action onClick={() => void stopFollowing()}>Stop showing it</Action>
      </p>
      <p>
        This browser cannot save to the folder, so your changes here stay in this tab until you reload. It shows new
        files after you choose the folder again. Chrome, Edge and the desktop app save to the folder.
      </p>
      {problem && <p className="text-destructive">{problem}</p>}
    </div>
  )
}

/** Shows the open folder, or the folder of the last visit when the browser asks again, under the library heading. */
export function FolderHeroNote() {
  const location = repository().location
  if (location.kind === 'picked-folder') return <FolderStorageNote name={location.name} className="mt-1 ml-6" />
  if (location.kind === 'followed-folder') return <FollowedFolderNote name={location.name} className="mt-1 ml-6" />
  return (
    <div className="ml-6">
      <FolderOffer offer={false} />
    </div>
  )
}
