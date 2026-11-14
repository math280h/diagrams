import { ArrowUpRight, MessageSquareWarning } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CommandBlock } from '@/components/CommandBlock'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { desktopApi } from '@/desktop/bridge'
import { BUG_REPORT_URL } from '@/desktop/constants'
import { problemReport, type Problem } from '@/lib/problem-report'
import { problemSubject } from '@/reports/recent-problems'
import { openReport } from '@/reports/report-store'
import { closeProblem, useProblemStore } from '@/store/problem-store'

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

function ProblemContent({ problem }: { problem: Problem }) {
  const about = useAboutLine()
  return (
    <>
      <DialogHeader>
        <DialogTitle>{problem.title}</DialogTitle>
        <DialogDescription>{problem.message}</DialogDescription>
      </DialogHeader>
      <CommandBlock label="Details for a bug report" value={problemReport(about, problem)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a
          href={BUG_REPORT_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[13px] font-medium hover:underline"
        >
          Open an issue on GitHub <ArrowUpRight aria-hidden className="size-3.5" />
        </a>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            closeProblem()
            openReport(problemSubject(problem))
          }}
        >
          <MessageSquareWarning /> Report this problem
        </Button>
      </div>
    </>
  )
}

/**
 * Shows the problem of the problem store: what happened, what the user can do, and the details to copy into a bug
 * report. Mount it once at the root of the app.
 */
export function ProblemDialog() {
  const problem = useProblemStore((state) => state.problem)
  return (
    <Dialog
      open={problem !== null}
      onOpenChange={(open) => {
        if (!open) closeProblem()
      }}
    >
      <DialogContent className="sm:max-w-lg">{problem && <ProblemContent problem={problem} />}</DialogContent>
    </Dialog>
  )
}
