import { create } from 'zustand'
import type { CrashRecord } from '@/desktop/contract'
import type { Problem } from '@/lib/problem-report'
import type { DocSnapshot } from '@/store/doc-store'

/** A problem that the app showed or caught, with the diagram that was open at the problem. */
export interface ProblemSubject {
  kind: 'problem'
  problem: Problem
  /** The time of the problem, in milliseconds since 1970. */
  time: number
  diagram: DocSnapshot
}

/** What a report tells: a problem that the app showed or caught, a crash, or only the note of the user. */
export type ReportSubject = ProblemSubject | { kind: 'crash'; crash: CrashRecord } | { kind: 'note' }

interface ReportDialogs {
  /** The subject of the open report dialog, or `null`. */
  subject: ReportSubject | null
  /** The number of opened reports, the key of the report form. */
  opened: number
  /** True while the list of problem reports shows. */
  listOpen: boolean
}

export const useReportDialogs = create<ReportDialogs>(() => ({ subject: null, opened: 0, listOpen: false }))

/** Opens the report dialog, and closes the list of problem reports. */
export function openReport(subject: ReportSubject) {
  useReportDialogs.setState(({ opened }) => ({ subject, opened: opened + 1, listOpen: false }))
}

export function closeReport() {
  useReportDialogs.setState({ subject: null })
}

export function openProblemReports() {
  useReportDialogs.setState({ listOpen: true })
}

export function closeProblemReports() {
  useReportDialogs.setState({ listOpen: false })
}
