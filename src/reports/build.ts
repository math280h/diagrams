import type { Problem } from '@/lib/problem-report'
import { REPORT_FORMAT, type CrashFacts, type Report } from './report'
import { stackFrames } from './stack'

const MAX_FACTS = 30
const ERROR_NAME = /^[A-Za-z_$][\w$]{0,59}$/
const NOTE_TITLE = 'A problem that the user describes'

export interface ReportContext {
  app: Report['app']
  system: Report['system']
  /** The kind of page, such as `editor`, without an id. */
  page: string
  time: Date
  /** Removes private values from a text. See `createRedactor`. */
  redact: (text: string) => string
}

function envelope(kind: Report['kind'], title: string, context: ReportContext): Report {
  return {
    format: REPORT_FORMAT,
    kind,
    time: context.time.toISOString(),
    app: context.app,
    system: context.system,
    page: context.page,
    title,
    message: '',
    facts: [],
    error: '',
    frames: [],
    crash: null,
    note: '',
  }
}

function errorName(name: string, redact: (text: string) => string): string {
  if (name === '') return ''
  return ERROR_NAME.test(name) ? redact(name) : 'Error'
}

function isStackFact(fact: string): boolean {
  return fact.startsWith('at ') || fact.startsWith('Error: ')
}

/** Returns the report of a problem that the app showed. The stack of its error gives the frames. */
export function reportFromProblem(problem: Problem, context: ReportContext): Report {
  return {
    ...envelope('error', context.redact(problem.title), context),
    message: context.redact(problem.message),
    facts: problem.facts
      .filter((fact) => !(problem.error && isStackFact(fact)))
      .slice(0, MAX_FACTS)
      .map(context.redact),
    error: errorName(problem.error?.name ?? '', context.redact),
    frames: problem.error
      ? stackFrames(problem.error.stack).map((frame) => ({
          ...frame,
          function: context.redact(frame.function),
          file: context.redact(frame.file),
        }))
      : [],
  }
}

const PROCESS_NAMES: Record<string, string> = {
  main: 'The app',
  browser: 'The app',
  renderer: 'The app window',
  gpu: 'The graphics process',
  utility: 'A helper process',
}

/** Returns the title of a crash, such as "The app window stopped". */
export function crashTitle(crash: Pick<CrashFacts, 'process'>): string {
  return `${PROCESS_NAMES[crash.process] ?? 'A process of the app'} stopped`
}

/** Returns a report without an error, in which the note of the user tells the problem. */
export function reportFromNote(context: ReportContext): Report {
  return envelope('note', NOTE_TITLE, context)
}

/** Returns the report of a crash of the desktop app. */
export function reportFromCrash(crash: CrashFacts, context: ReportContext): Report {
  return {
    ...envelope('crash', crashTitle(crash), context),
    crash: {
      ...crash,
      process: context.redact(crash.process),
      reason: context.redact(crash.reason),
      exception: context.redact(crash.exception),
      location: context.redact(crash.location),
    },
  }
}
