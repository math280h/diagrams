import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as libCoverage from '@vitest/istanbul-lib-coverage'
import * as libReport from '@vitest/istanbul-lib-report'
import astV8ToIstanbul from 'ast-v8-to-istanbul'
import { parseAstAsync } from 'vite'
import { COVERAGE_EXCLUDE, COVERAGE_INCLUDE, type ScriptCoverage } from './coverage-files.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const UNIT_COVERAGE = path.join(ROOT, 'coverage', 'coverage-final.json')
const E2E_COVERAGE = path.join(ROOT, 'coverage-e2e')
const ALL_COVERAGE = path.join(ROOT, 'coverage-all')
const INLINE_SOURCE_MAP =
  /\/\/# sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,([A-Za-z0-9+/=]+)\s*$/
const METRICS = ['statements', 'branches', 'functions', 'lines'] as const
const BADGE_COLORS = [
  [90, 'brightgreen'],
  [80, 'green'],
  [70, 'yellowgreen'],
  [60, 'yellow'],
  [50, 'orange'],
] as const
const METRIC_NAMES: Record<Metric, string> = {
  statements: 'Statements',
  branches: 'Branches',
  functions: 'Functions',
  lines: 'Lines',
}

type Metric = (typeof METRICS)[number]
type FileData = libCoverage.FileCoverageData
type CoverageData = Record<string, FileData>
type Location = libCoverage.Range

/** Tells whether the coverage reports measure a file, from its path relative to the repository root. */
export function isMeasured(relativePath: string): boolean {
  return (
    COVERAGE_INCLUDE.some((glob) => path.posix.matchesGlob(relativePath, glob)) &&
    !COVERAGE_EXCLUDE.some((glob) => path.posix.matchesGlob(relativePath, glob))
  )
}

/**
 * Returns the file of the repository that the dev server sent at a URL, or null when the coverage reports do not
 * measure that file.
 */
export function measuredFile(url: string, root = ROOT): string | null {
  const relativePath = decodeURIComponent(new URL(url).pathname).replace(/^\//, '')
  return isMeasured(relativePath) ? path.join(root, relativePath) : null
}

/** Returns the inline source map at the end of the code that the dev server sent, with absolute source URLs. */
export function inlineSourceMap(code: string, fileUrl: string) {
  const match = INLINE_SOURCE_MAP.exec(code)
  if (!match) return undefined
  const map = JSON.parse(Buffer.from(match[1]!, 'base64').toString('utf8')) as { sources?: (string | null)[] }
  const sources = (map.sources ?? []).filter((source) => source !== null).map((source) => new URL(source, fileUrl).href)
  return { ...map, sources: sources.length > 0 ? sources : [fileUrl] }
}

/**
 * Converts the V8 coverage of the browser scripts to istanbul coverage data, with the converter of
 * `@vitest/coverage-v8`. Each `Infinity` in the data becomes `null`, as in the `coverage-final.json` file of Vitest.
 */
export async function e2eCoverageData(scripts: readonly ScriptCoverage[], root = ROOT): Promise<CoverageData> {
  const coverageMap = libCoverage.createCoverageMap()
  for (const script of scripts) {
    const file = measuredFile(script.url, root)
    if (!file) continue
    const fileUrl = pathToFileURL(file).href
    coverageMap.merge(
      await astV8ToIstanbul({
        code: script.source,
        sourceMap: inlineSourceMap(script.source, fileUrl) as Parameters<typeof astV8ToIstanbul>[0]['sourceMap'],
        ast: parseAstAsync(script.source),
        coverage: { functions: script.functions, url: fileUrl },
        wrapperLength: 0,
      }),
    )
  }
  return JSON.parse(JSON.stringify(coverageMap.toJSON())) as CoverageData
}

function startOf(location: Location | undefined): string {
  return location ? `${location.start.line}:${location.start.column}` : ''
}

function hitsByStart<T>(map: Record<string, T>, counts: Record<string, number>, locate: (entry: T) => Location) {
  const hits = new Map<string, number>()
  for (const [id, entry] of Object.entries(map)) {
    const key = startOf(locate(entry))
    hits.set(key, Math.max(hits.get(key) ?? 0, counts[id] ?? 0))
  }
  return hits
}

function addFileHits(file: FileData, e2e: FileData): FileData {
  const statementHits = hitsByStart(e2e.statementMap, e2e.s, (location) => location)
  const functionHits = hitsByStart(e2e.fnMap, e2e.f, (fn) => fn.decl)
  const e2eBranches = new Map(Object.entries(e2e.branchMap).map(([id, branch]) => [startOf(branch.loc), e2e.b[id]!]))
  return {
    ...file,
    s: Object.fromEntries(
      Object.entries(file.s).map(([id, count]) => [
        id,
        count + (statementHits.get(startOf(file.statementMap[id])) ?? 0),
      ]),
    ),
    f: Object.fromEntries(
      Object.entries(file.f).map(([id, count]) => [id, count + (functionHits.get(startOf(file.fnMap[id]?.decl)) ?? 0)]),
    ),
    b: Object.fromEntries(
      Object.entries(file.b).map(([id, counts]) => {
        const hits = e2eBranches.get(startOf(file.branchMap[id]?.loc))
        return [id, hits?.length === counts.length ? counts.map((count, i) => count + hits[i]!) : counts]
      }),
    ),
  }
}

/**
 * Adds the e2e coverage to the coverage of the unit and browser tests. The statements, functions and branches of the
 * unit coverage stay the same. The function adds to each one the counts of the e2e entries that start at the same line
 * and column.
 */
export function addE2eHits(unit: CoverageData, e2e: CoverageData): CoverageData {
  const normalize = (file: string) => path.normalize(file).toLowerCase()
  const e2eByFile = new Map(Object.entries(e2e).map(([file, data]) => [normalize(file), data]))
  return Object.fromEntries(
    Object.entries(unit).map(([file, data]) => {
      const e2eData = e2eByFile.get(normalize(file))
      return [file, e2eData ? addFileHits(data, e2eData) : data]
    }),
  )
}

/** Returns the metrics of a coverage summary that are below their thresholds. */
export function belowThresholds(
  summary: Record<Metric, { pct: number | 'Unknown' }>,
  thresholds: Partial<Record<Metric, number>>,
): string[] {
  return METRICS.filter((metric) => {
    const pct = summary[metric].pct
    const threshold = thresholds[metric]
    return typeof pct === 'number' && threshold !== undefined && pct < threshold
  }).map((metric) => `${metric}: ${summary[metric].pct}% is below the threshold of ${thresholds[metric]}%`)
}

/** Returns a Markdown table of the totals of a `coverage-summary.json` file. */
export function summaryTable(
  summary: Record<Metric, { pct: number; covered: number; total: number }>,
  title: string,
): string {
  return [
    `### ${title}`,
    '',
    '| | Percent | Covered |',
    '| --- | --- | --- |',
    ...METRICS.map(
      (metric) =>
        `| ${METRIC_NAMES[metric]} | ${summary[metric].pct}% | ${summary[metric].covered} of ${summary[metric].total} |`,
    ),
  ].join('\n')
}

/**
 * Returns the shields.io endpoint badge for the line coverage of a `coverage-summary.json` file. The message is the
 * percentage, rounded down to a whole number.
 *
 * @see https://shields.io/badges/endpoint-badge
 */
export function coverageBadge(summary: Record<Metric, { pct: number | 'Unknown' }>) {
  const pct = summary.lines.pct
  const color = typeof pct === 'number' ? (BADGE_COLORS.find(([min]) => pct >= min)?.[1] ?? 'red') : 'lightgrey'
  return {
    schemaVersion: 1,
    label: 'coverage',
    message: typeof pct === 'number' ? `${Math.floor(pct)}%` : 'unknown',
    color,
  }
}

function readScripts(folders: readonly string[]): ScriptCoverage[] {
  return folders.flatMap((folder) =>
    readdirSync(folder)
      .filter((name) => name.endsWith('.json'))
      .flatMap((name) => JSON.parse(readFileSync(path.join(folder, name), 'utf8')) as ScriptCoverage[]),
  )
}

async function merge(unitFile: string, outDir: string, e2eFolders: readonly string[]) {
  const unit = JSON.parse(readFileSync(unitFile, 'utf8')) as CoverageData
  const coverageMap = libCoverage.createCoverageMap(addE2eHits(unit, await e2eCoverageData(readScripts(e2eFolders))))
  rmSync(outDir, { recursive: true, force: true })
  const context = libReport.createContext({ dir: outDir, coverageMap })
  for (const name of ['json', 'json-summary', 'html', 'text-summary'] as const) {
    ;(await libReport.createAsync(name, { projectRoot: ROOT })).execute(context)
  }
  return coverageMap.getCoverageSummary().toJSON()
}

function runWebTests(options: readonly string[]) {
  rmSync(E2E_COVERAGE, { recursive: true, force: true })
  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli')
  const result = spawnSync(process.execPath, [cli, 'test', '--project=web', ...options], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, E2E_COVERAGE: '1' },
  })
  if (result.status !== 0) throw new Error(`The web tests failed with exit code ${result.status}.`)
}

const USAGE = `Usage:
  node scripts/coverage.ts run [playwright options]
  node scripts/coverage.ts merge <coverage-final.json> <out dir> <e2e folder>... [--thresholds s,b,f,l]
  node scripts/coverage.ts summary <coverage-summary.json> <title>
  node scripts/coverage.ts badge <coverage-summary.json>`

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'run') {
    if (!existsSync(UNIT_COVERAGE)) throw new Error('No coverage/coverage-final.json. Run pnpm test:coverage first.')
    runWebTests(args)
    await merge(UNIT_COVERAGE, ALL_COVERAGE, [E2E_COVERAGE])
  } else if (command === 'merge' && args.length >= 3) {
    const [unitFile, outDir, ...rest] = args as [string, string, ...string[]]
    const thresholdIndex = rest.indexOf('--thresholds')
    const summary = await merge(unitFile, outDir, thresholdIndex === -1 ? rest : rest.slice(0, thresholdIndex))
    if (thresholdIndex !== -1) {
      const values = (rest[thresholdIndex + 1] ?? '').split(',').map(Number)
      const problems = belowThresholds(summary, Object.fromEntries(METRICS.map((metric, i) => [metric, values[i]])))
      for (const problem of problems) console.error(problem)
      if (problems.length > 0) process.exitCode = 1
    }
  } else if (command === 'summary' && args.length === 2) {
    const [file, title] = args as [string, string]
    console.log(summaryTable(JSON.parse(readFileSync(file, 'utf8')).total, title))
  } else if (command === 'badge' && args.length === 1) {
    console.log(JSON.stringify(coverageBadge(JSON.parse(readFileSync(args[0]!, 'utf8')).total)))
  } else {
    throw new Error(USAGE)
  }
}

if (import.meta.main) await main()
