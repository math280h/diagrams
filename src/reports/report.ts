import { z } from '../lib/zod.ts'

export const REPORT_FORMAT = 1

/** An error that the app caught, a crash of the desktop app, or a problem that the user describes in the note only. */
export const REPORT_KINDS = ['error', 'crash', 'note'] as const

export const OPERATING_SYSTEMS = ['windows', 'macos', 'linux', 'android', 'ios', 'other'] as const
export type OperatingSystem = (typeof OPERATING_SYSTEMS)[number]

const frameSchema = z.object({
  /** The function name, or an empty string for an anonymous function. */
  function: z.string(),
  /** The file name only, such as `index-a1b2c3.js`. A file of a browser extension is `extension`. */
  file: z.string(),
  line: z.number().int().min(0),
  column: z.number().int().min(0),
})
export type StackFrame = z.infer<typeof frameSchema>

const crashSchema = z.object({
  /** The process that stopped: `main`, `renderer`, `gpu`, `utility` or another Electron process type. */
  process: z.string(),
  /** The reason that Electron gives, such as `crashed` or `oom`, or `unknown` for a dump without an event. */
  reason: z.string(),
  exitCode: z.number().int().nullable(),
  /** The exception in the crash dump, such as `EXCEPTION_ACCESS_VIOLATION`, or an empty string. */
  exception: z.string(),
  /** Where the process stopped, as a module file name and an offset, such as `Diagrams.exe+0x1a2b3c`, or an empty string. */
  location: z.string(),
})
export type CrashFacts = z.infer<typeof crashSchema>

/**
 * A problem report: the only text that leaves the device when the user sends a report. The user sees all of it first.
 * It holds no diagram, file name, address or secret.
 */
export const reportSchema = z.object({
  format: z.literal(REPORT_FORMAT),
  kind: z.enum(REPORT_KINDS),
  /** The time of the problem, as an ISO 8601 text in UTC. */
  time: z.string(),
  app: z.object({
    version: z.string(),
    surface: z.enum(['website', 'desktop']),
    /** `release`, `preview` or `development`. */
    channel: z.string(),
  }),
  system: z.object({
    os: z.enum(OPERATING_SYSTEMS),
    /** The browser and its major version, such as `Chrome 142`, or an empty string. */
    browser: z.string(),
    /** The Electron version of the desktop app, or an empty string. */
    electron: z.string(),
  }),
  /** The kind of page, such as `editor` or `library`, without an id. */
  page: z.string(),
  title: z.string(),
  /** The message of the problem after the removal rules. */
  message: z.string(),
  /** The facts of the problem after the removal rules, one per line. */
  facts: z.array(z.string()),
  /** The name of the error, such as `TypeError`, or an empty string. */
  error: z.string(),
  frames: z.array(frameSchema),
  crash: crashSchema.nullable(),
  /** What the user wrote about the problem. */
  note: z.string(),
})
export type Report = z.infer<typeof reportSchema>

/** Returns the report as the exact JSON text that a sent or saved report holds. */
export function reportJson(report: Report): string {
  return JSON.stringify(report, null, 2)
}
