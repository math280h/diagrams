import { ArrowUpRight } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { CommandBlock } from '@/components/CommandBlock'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { desktopApi } from '@/desktop/bridge'
import { BUG_REPORT_URL } from '@/desktop/constants'
import { problemReport, type Problem } from '@/lib/problem-report'

function websiteAbout() {
  return `Diagrams website at ${window.location.host}, ${navigator.userAgent}`
}

function useAboutLine() {
  const [about, setAbout] = useState(desktopApi() ? 'Diagrams desktop app' : websiteAbout())
  useEffect(() => {
    let current = true
    void desktopApi()
      ?.request('app.about', null)
      .then(
        (next) => {
          if (current) setAbout(`Diagrams ${next.version}, ${next.system}`)
        },
        () => undefined,
      )
    return () => {
      current = false
    }
  }, [])
  return about
}

function ProblemContent({ problem, actions }: { problem: Problem; actions?: ReactNode }) {
  const about = useAboutLine()
  return (
    <>
      <DialogHeader>
        <DialogTitle>{problem.title}</DialogTitle>
        <DialogDescription>{problem.message}</DialogDescription>
      </DialogHeader>
      {actions}
      <CommandBlock label="Details for a bug report" value={problemReport(about, problem)} />
      <a
        href={BUG_REPORT_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 self-start text-[13px] font-medium hover:underline"
      >
        Report a problem <ArrowUpRight aria-hidden className="size-3.5" />
      </a>
    </>
  )
}

/**
 * Shows a problem: what happened, what the user can do, and the details to copy into a bug report. The caller keeps
 * the problem up to date. The dialog closes when the problem becomes `null`.
 *
 * @param actions - Buttons that fix the problem, under the message.
 */
export function ProblemDialog({
  open,
  onOpenChange,
  problem,
  actions,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  problem: Problem | null
  actions?: ReactNode
}) {
  return (
    <Dialog open={open && problem !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {problem && <ProblemContent problem={problem} actions={actions} />}
      </DialogContent>
    </Dialog>
  )
}
