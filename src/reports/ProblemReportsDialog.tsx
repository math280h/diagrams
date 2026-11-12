import { FolderOpen, MessageSquarePlus, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { DialogSection as Section } from '@/components/DialogSection'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { isDesktop, requestErrorMessage } from '@/desktop/bridge'
import type { CrashRecord } from '@/desktop/contract'
import { formatBytes } from '@/lib/format'
import { reportBackend, type ReportBackend } from './backend'
import { crashTitle } from './build'
import { deleteCrash, showCrashDump, useCrashes } from './crashes'
import type { SentReport } from './history'
import { forgetProblem, useRecentProblems } from './recent-problems'
import { closeProblemReports, openReport, useReportDialogs } from './report-store'

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const dayFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

function Row({ title, detail, children }: { title: string; detail: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-2 pr-1.5 pl-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate font-medium text-foreground" title={title}>
          {title}
        </p>
        <div className="leading-5 text-muted-foreground">{detail}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </li>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed px-3 py-2.5 text-muted-foreground">{children}</p>
}

function RecentProblems() {
  const problems = useRecentProblems((state) => state.problems)
  return (
    <Section
      title="Problems in this session"
      description="The errors that the app showed or caught since you opened it. The app forgets them when you close it."
    >
      {problems.length === 0 ? (
        <Empty>No problems in this session.</Empty>
      ) : (
        <ul aria-label="Problems in this session" className="divide-y rounded-lg border">
          {problems.map((item) => (
            <Row
              key={item.id}
              title={item.problem.title}
              detail={
                <>
                  <span className="line-clamp-2 break-words">{item.problem.message}</span>
                  <span>{timeFormat.format(item.time)}</span>
                </>
              }
            >
              <Button variant="outline" size="sm" onClick={() => openReport({ kind: 'problem', ...item })}>
                Report
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Forget: ${item.problem.title}`}
                onClick={() => forgetProblem(item.id)}
              >
                <Trash2 />
              </Button>
            </Row>
          ))}
        </ul>
      )}
    </Section>
  )
}

function crashDetail(crash: CrashRecord): string {
  if (!crash.dump) return 'No crash dump.'
  const parts = [crash.dump.exception, crash.dump.location].filter((part) => part !== '')
  return `${parts.length > 0 ? `${parts.join(' at ')}. ` : ''}Crash dump of ${formatBytes(crash.dump.bytes)}.`
}

function Crashes() {
  const crashes = useCrashes((state) => state.crashes)
  return (
    <Section
      title="Crashes"
      description="When a part of the app stops, the app keeps a crash dump on this computer. It keeps the newest 5 for 7 days."
    >
      {crashes === null ? (
        <Empty>Loading the crashes…</Empty>
      ) : crashes.length === 0 ? (
        <Empty>No crashes.</Empty>
      ) : (
        <ul aria-label="Crashes" className="divide-y rounded-lg border">
          {crashes.map((crash) => (
            <Row
              key={crash.id}
              title={crashTitle(crash)}
              detail={
                <>
                  <span className="block break-words">{crashDetail(crash)}</span>
                  <span>{timeFormat.format(crash.time)}</span>
                </>
              }
            >
              <Button variant="outline" size="sm" onClick={() => openReport({ kind: 'crash', crash })}>
                Report
              </Button>
              {crash.dump && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Show the crash dump of ${timeFormat.format(crash.time)}`}
                  onClick={() => showCrashDump(crash.id)}
                >
                  <FolderOpen />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete the crash of ${timeFormat.format(crash.time)}`}
                onClick={() => void deleteCrash(crash.id)}
              >
                <Trash2 />
              </Button>
            </Row>
          ))}
        </ul>
      )}
    </Section>
  )
}

function SentReports({ backend }: { backend: ReportBackend }) {
  const [reports, setReports] = useState<SentReport[] | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  useEffect(() => {
    let current = true
    backend.sentReports().then(
      (list) => {
        if (current) setReports(list)
      },
      () => {
        if (current) setReports([])
      },
    )
    return () => {
      current = false
    }
  }, [backend])

  const remove = async (report: SentReport) => {
    setDeleting(report.id)
    await backend.deleteSent(report.id).then(
      (rest) => {
        setReports(rest)
        toast.success('Deleted the report from the report server')
      },
      (error: unknown) => toast.error('Could not delete the report', { description: requestErrorMessage(error) }),
    )
    setDeleting(null)
  }

  if (!backend.canSend && (reports === null || reports.length === 0)) return null
  return (
    <Section
      title="Sent reports"
      description="The reports that you sent from this device. The report server deletes each one on the day below."
    >
      {reports === null ? (
        <Empty>Loading the sent reports…</Empty>
      ) : reports.length === 0 ? (
        <Empty>You sent no reports from this device.</Empty>
      ) : (
        <ul aria-label="Sent reports" className="divide-y rounded-lg border">
          {reports.map((report) => (
            <Row
              key={report.id}
              title={report.title}
              detail={
                <>
                  <span className="block">
                    Sent {timeFormat.format(report.sentAt)}
                    {report.withDump ? ', with the crash dump' : ''}. Deleted on {dayFormat.format(report.expiresAt)}.
                  </span>
                  <span className="font-mono text-xs">{report.id}</span>
                </>
              }
            >
              <Button variant="outline" size="sm" disabled={deleting === report.id} onClick={() => void remove(report)}>
                Delete from server
              </Button>
            </Row>
          ))}
        </ul>
      )}
    </Section>
  )
}

/**
 * Lists the problems and crashes that the app keeps on this device and the reports that it sent, so that the user can
 * read them, report them or delete them. Mount it once at the root of the app.
 */
export function ProblemReportsDialog() {
  const open = useReportDialogs((state) => state.listOpen)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeProblemReports()
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Problem reports</DialogTitle>
          <DialogDescription>
            The app keeps problems and crashes on this device. Nothing leaves it until you read a report and send it.
          </DialogDescription>
        </DialogHeader>
        <RecentProblems />
        {isDesktop() && <Crashes />}
        <SentReports backend={reportBackend()} />
        <DialogFooter>
          <Button variant="outline" onClick={() => openReport({ kind: 'note' })}>
            <MessageSquarePlus /> Describe a problem
          </Button>
          <Button onClick={closeProblemReports}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
