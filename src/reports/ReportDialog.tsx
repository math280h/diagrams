import { ArrowUpRight, Copy, FileDown, FolderOpen, Loader2, Send } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { copyText } from '@/lib/copy-text'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { requestErrorMessage } from '@/desktop/bridge'
import { BUG_REPORT_URL } from '@/desktop/constants'
import { formatBytes } from '@/lib/format'
import { reportBackend, type ReportBackend } from './backend'
import { reportFromCrash, reportFromNote, reportFromProblem } from './build'
import { reportContext } from './context'
import { showCrashDump } from './crashes'
import type { SentReport } from './history'
import { reportJson, type Report } from './report'
import { closeReport, openProblemReports, useReportDialogs, type ReportSubject } from './report-store'

const MAX_NOTE_CHARS = 2000

const TITLES: Record<ReportSubject['kind'], string> = {
  problem: 'Report this problem',
  crash: 'Report this crash',
  note: 'Describe a problem',
}

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'failed'; message: string }
  | { kind: 'sent'; report: SentReport }

function baseReport(subject: ReportSubject, context: Awaited<ReturnType<typeof reportContext>>): Report {
  switch (subject.kind) {
    case 'problem':
      return reportFromProblem(subject.problem, { ...context, time: new Date(subject.time) })
    case 'crash': {
      const { crash } = subject
      const facts = {
        process: crash.process,
        reason: crash.reason,
        exitCode: crash.exitCode,
        exception: crash.dump?.exception ?? '',
        location: crash.dump?.location ?? '',
      }
      return reportFromCrash(facts, { ...context, time: new Date(crash.time) })
    }
    case 'note':
      return reportFromNote(context)
  }
}

function useBaseReport(subject: ReportSubject) {
  const [state, setState] = useState<{ report: Report | null; error: string | null }>({ report: null, error: null })
  useEffect(() => {
    let current = true
    reportContext(subject.kind === 'problem' ? [subject.diagram] : []).then(
      (context) => {
        if (current) setState({ report: baseReport(subject, context), error: null })
      },
      (error: unknown) => {
        if (current) setState({ report: null, error: requestErrorMessage(error) })
      },
    )
    return () => {
      current = false
    }
  }, [subject])
  return state
}

const dayFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' })

function sendFailure(error: unknown): string {
  return requestErrorMessage(error) || 'The report could not be sent.'
}

function DumpSwitch({
  subject,
  checked,
  onChange,
}: {
  subject: Extract<ReportSubject, { kind: 'crash' }>
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const hintId = useId()
  const dump = subject.crash.dump
  if (!dump) return null
  const label = `Add the crash dump (${formatBytes(dump.bytes)})`
  return (
    <div className="space-y-2 rounded-lg border p-3 text-[13px]">
      <div className="flex items-start justify-between gap-4">
        <p className="font-medium text-foreground">{label}</p>
        <Switch aria-label={label} aria-describedby={hintId} checked={checked} onCheckedChange={onChange} />
      </div>
      <p id={hintId} className="leading-5 text-muted-foreground">
        A crash dump is a copy of part of the app&apos;s memory at the time of the crash. It can contain diagram text,
        file paths and other data that the app had open. The app encrypts it together with the report, and only the
        maintainers can read it. To check the file first, use Show the file.
      </p>
      <Button variant="outline" size="sm" onClick={() => showCrashDump(subject.crash.id)}>
        <FolderOpen /> Show the file
      </Button>
    </div>
  )
}

function SentView({ report }: { report: SentReport }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Report sent</DialogTitle>
        <DialogDescription>Thank you. The maintainers can read the report now.</DialogDescription>
      </DialogHeader>
      <div className="space-y-1 text-[13px] leading-5 text-muted-foreground">
        <p>
          Report ID: <code className="font-mono text-xs text-foreground select-all">{report.id}</code>
        </p>
        <p>
          The server deletes the report on {dayFormat.format(report.expiresAt)}. You can delete it earlier in Problem
          reports.
        </p>
      </div>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => {
            closeReport()
            openProblemReports()
          }}
        >
          Problem reports
        </Button>
        <Button onClick={closeReport}>Done</Button>
      </DialogFooter>
    </>
  )
}

function ReportForm({ subject, backend }: { subject: ReportSubject; backend: ReportBackend }) {
  const { report, error } = useBaseReport(subject)
  const [note, setNote] = useState('')
  const [withDump, setWithDump] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const sending = useRef<AbortController | null>(null)
  const noteId = useId()
  const noteHintId = useId()
  const previewId = useId()
  const json = useMemo(() => (report ? reportJson({ ...report, note: note.trim() }) : ''), [report, note])
  const dumpOf = subject.kind === 'crash' && withDump ? subject.crash.id : null
  const busy = status.kind === 'sending'

  useEffect(() => () => sending.current?.abort(), [])

  if (status.kind === 'sent') return <SentView report={status.report} />

  const send = async () => {
    const controller = new AbortController()
    sending.current = controller
    setStatus({ kind: 'sending' })
    const outcome = await backend.send(json, dumpOf, controller.signal).then(
      (sent): Status => ({ kind: 'sent', report: sent }),
      (caught: unknown): Status =>
        controller.signal.aborted ? { kind: 'idle' } : { kind: 'failed', message: sendFailure(caught) },
    )
    sending.current = null
    setStatus(outcome)
  }

  const save = async () => {
    try {
      if (await backend.saveEncrypted(json, dumpOf)) toast.success('Saved the encrypted report')
    } catch (caught) {
      toast.error('Could not save the report', { description: requestErrorMessage(caught) })
    }
  }

  const ready = report !== null && !busy
  return (
    <>
      <DialogHeader>
        <DialogTitle>{TITLES[subject.kind]}</DialogTitle>
        <DialogDescription>
          The report is the text below. It has no diagram content, file names, addresses or secrets.
          {backend.canEncrypt && ' The app encrypts it on this device, and only the maintainers can read it.'}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <label htmlFor={noteId} className="text-[13px] font-medium">
          {subject.kind === 'note' ? 'What is the problem?' : 'What did you do before the problem? (optional)'}
        </label>
        <Textarea
          id={noteId}
          aria-describedby={noteHintId}
          value={note}
          maxLength={MAX_NOTE_CHARS}
          disabled={busy}
          placeholder="For example: I exported a video of a flow with 40 steps."
          className="max-h-40"
          onChange={(event) => setNote(event.target.value)}
        />
        <p id={noteHintId} className="text-[13px] leading-5 text-muted-foreground">
          The note is sent as written. Leave out private details.
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p id={previewId} className="text-[13px] font-medium">
            Report text
          </p>
          <Button variant="ghost" size="sm" disabled={!report} onClick={() => copyText(json, 'Copied the report text')}>
            <Copy /> Copy
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-[13px] text-destructive">
            Could not make the report: {error}
          </p>
        ) : (
          <pre
            aria-labelledby={previewId}
            tabIndex={0}
            className="max-h-56 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-5 whitespace-pre-wrap break-all [font-variant-ligatures:none]"
          >
            {report ? json : 'Making the report…'}
          </pre>
        )}
      </div>

      {subject.kind === 'crash' && <DumpSwitch subject={subject} checked={withDump} onChange={setWithDump} />}

      {status.kind === 'sending' && (
        <p role="status" className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 aria-hidden className="size-3.5 animate-spin" />
          Sending. The app first solves an anti-spam puzzle. This takes a few seconds.
        </p>
      )}
      {status.kind === 'failed' && (
        <p role="alert" className="text-[13px] text-destructive">
          {status.message}
        </p>
      )}
      {!backend.canSend && !backend.canEncrypt && (
        <p className="text-[13px] leading-5 text-muted-foreground">
          This build sends no reports. Copy the report text into an issue on GitHub.
        </p>
      )}

      <DialogFooter className="sm:justify-between">
        <a
          href={BUG_REPORT_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 self-center text-[13px] font-medium hover:underline"
        >
          Open an issue on GitHub <ArrowUpRight aria-hidden className="size-3.5" />
        </a>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {busy && (
            <Button variant="outline" onClick={() => sending.current?.abort()}>
              Cancel
            </Button>
          )}
          {backend.canEncrypt && !busy && (
            <Button variant={backend.canSend ? 'outline' : 'default'} disabled={!ready} onClick={() => void save()}>
              <FileDown /> Save encrypted file
            </Button>
          )}
          {backend.canSend && (
            <Button disabled={!ready || (subject.kind === 'note' && note.trim() === '')} onClick={() => void send()}>
              {busy ? <Loader2 className="animate-spin" /> : <Send />} Send report
            </Button>
          )}
        </div>
      </DialogFooter>
    </>
  )
}

/** Shows a problem report before it leaves the device, and sends or saves it. Mount it once at the root of the app. */
export function ReportDialog() {
  const subject = useReportDialogs((state) => state.subject)
  const opened = useReportDialogs((state) => state.opened)
  return (
    <Dialog
      open={subject !== null}
      onOpenChange={(open) => {
        if (!open) closeReport()
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        {subject && <ReportForm key={opened} subject={subject} backend={reportBackend()} />}
      </DialogContent>
    </Dialog>
  )
}
