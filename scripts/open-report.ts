import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { Decrypter } from 'age-encryption'
import { errorMessage } from '../src/lib/error-message.ts'
import { decodeBundle, decompressDump } from '../src/reports/bundle.ts'
import { REPORT_ID, REPORT_SIZE_LIMITS } from '../src/reports/protocol.ts'
import { reportSchema } from '../src/reports/report.ts'

const USAGE = `Usage: node scripts/open-report.ts --identity <age identity file> [--out <folder>] <report file or folder>...

Decrypts problem reports with an age identity. For each report, it writes report.json, and crash.dmp when the report
holds a crash dump, to a new folder below --out (default: ./reports-opened). It never overwrites a file.`

const IDENTITY_LINE = /^AGE-SECRET-KEY-(?:PQ-)?1[0-9A-Z]+$/
const MAX_FILE_BYTES = REPORT_SIZE_LIMITS.dump + 1024 * 1024
const MAX_DUMP_BYTES = 512 * 1024 * 1024
const REPORT_SUFFIX = '.age'
// Terminals read C0 and C1 control characters as commands, and bidirectional marks change the order of the text.
const UNPRINTABLE_RANGES: readonly [first: number, last: number][] = [
  [0x00, 0x08],
  [0x0b, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
]

function unprintable(character: string): boolean {
  const code = character.codePointAt(0) ?? 0
  return UNPRINTABLE_RANGES.some(([first, last]) => code >= first && code <= last)
}

/** Returns the age identities in the text of an identity file. Comment lines start with `#`. */
export function readIdentities(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => IDENTITY_LINE.test(line))
}

/** Returns a text without the characters that a terminal reads as commands. */
export function printable(text: string): string {
  return text.replace(/./gsu, (character) => (unprintable(character) ? '' : character))
}

/** Returns the name of the folder for a report file: the report id, or a safe form of the file name. */
export function reportFolderName(file: string): string {
  const base = path.basename(file, REPORT_SUFFIX)
  return REPORT_ID.test(base) ? base : base.replace(/[^\w.-]+/g, '_').replace(/^\.+/, '_') || 'report'
}

async function reportFiles(inputs: readonly string[]): Promise<string[]> {
  const files: string[] = []
  for (const input of inputs) {
    const info = await stat(input)
    if (!info.isDirectory()) {
      files.push(input)
      continue
    }
    for (const name of (await readdir(input)).toSorted()) {
      if (name.endsWith(REPORT_SUFFIX)) files.push(path.join(input, name))
    }
  }
  return files
}

async function openReport(file: string, identities: readonly string[], outFolder: string) {
  const info = await stat(file)
  if (info.size > MAX_FILE_BYTES) throw new Error(`${file} is larger than a report can be.`)
  const decrypter = new Decrypter()
  for (const identity of identities) decrypter.addIdentity(identity)
  const bundle = decodeBundle(await decrypter.decrypt(new Uint8Array(await readFile(file))))
  const dump = bundle.dump ? await decompressDump(bundle.dump, MAX_DUMP_BYTES) : null
  const folder = path.join(outFolder, reportFolderName(file))
  await mkdir(folder, { recursive: true })
  await writeFile(path.join(folder, 'report.json'), bundle.json, { flag: 'wx' })
  if (dump) await writeFile(path.join(folder, 'crash.dmp'), dump, { flag: 'wx' })

  let parsed: unknown = null
  try {
    parsed = JSON.parse(bundle.json) as unknown
  } catch {
    parsed = null
  }
  const report = reportSchema.safeParse(parsed)
  const summary = report.success
    ? `${report.data.kind}, ${report.data.time}, ${report.data.app.surface} ${report.data.app.version}: ${report.data.title}`
    : 'The report text does not have the form of a problem report.'
  console.log(`${printable(folder)}\n  ${printable(summary)}${dump ? `\n  crash dump: ${dump.length} bytes` : ''}`)
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { identity: { type: 'string' }, out: { type: 'string', default: 'reports-opened' } },
  })
  if (!values.identity || positionals.length === 0) {
    console.error(USAGE)
    process.exitCode = 2
    return
  }
  const identities = readIdentities(await readFile(values.identity, 'utf8'))
  if (identities.length === 0) throw new Error(`${values.identity} holds no age identity.`)
  let failed = 0
  for (const file of await reportFiles(positionals)) {
    try {
      await openReport(file, identities, values.out)
    } catch (error) {
      failed++
      console.error(`${printable(file)}: ${printable(errorMessage(error))}`)
    }
  }
  if (failed > 0) process.exitCode = 1
}

if (import.meta.main) await main()
