import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Logger, SourceLocation } from 'babel-plugin-react-compiler'
import type { Plugin } from 'vite'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** The functions in a file that React Compiler does not compile for one reason. */
export interface CompilerSkips {
  file: string
  reason: string
  count: number
}

/**
 * The functions that React Compiler does not compile in the app and the standalone player. The build fails when the
 * compiler skips other functions, or no longer skips one of these.
 */
export const KNOWN_SKIPS: readonly CompilerSkips[] = [
  { file: 'src/canvas/edges/FlowEdge.tsx', reason: 'Existing memoization could not be preserved', count: 1 },
  {
    file: 'src/canvas/edges/routing.ts',
    reason: '(BuildHIR::lowerExpression) Handle ||= operators in AssignmentExpression',
    count: 1,
  },
  {
    file: 'src/desktop/download.ts',
    reason: '(BuildHIR::lowerExpression) Handle ??= operators in AssignmentExpression',
    count: 1,
  },
  {
    file: 'src/editor/flow/Timeline.tsx',
    reason: '(BuildHIR::node.lowerReorderableExpression) Expression type `CallExpression` cannot be safely reordered',
    count: 1,
  },
  {
    file: 'src/editor/flow/TraceImportDialog.tsx',
    reason: "(BuildHIR::lowerStatement) Handle TryStatement with a finalizer ('finally') clause",
    count: 1,
  },
  {
    file: 'src/export/ExportDialog.tsx',
    reason: "(BuildHIR::lowerStatement) Handle TryStatement with a finalizer ('finally') clause",
    count: 3,
  },
  { file: 'src/export/HtmlExport.tsx', reason: '(BuildHIR::lowerExpression) Handle Import expressions', count: 1 },
  {
    file: 'src/export/HtmlExport.tsx',
    reason: "(BuildHIR::lowerStatement) Handle TryStatement with a finalizer ('finally') clause",
    count: 1,
  },
  {
    file: 'src/export/ReadmeExport.tsx',
    reason: "(BuildHIR::lowerStatement) Handle TryStatement with a finalizer ('finally') clause",
    count: 1,
  },
  { file: 'src/io/ImportDialog.tsx', reason: '(BuildHIR::lowerExpression) Handle Import expressions', count: 5 },
  {
    file: 'src/io/ImportDialog.tsx',
    reason: "(BuildHIR::lowerStatement) Handle TryStatement with a finalizer ('finally') clause",
    count: 2,
  },
  {
    file: 'src/io/ImportDialog.tsx',
    reason: '(BuildHIR::lowerStatement) Support ThrowStatement inside of try/catch',
    count: 1,
  },
]

interface Skip {
  file: string
  reason: string
}

const skips = new Map<string, Skip>()
const failures: string[] = []

function position(location: SourceLocation | null): string {
  return location && typeof location === 'object' ? `${location.start.line}:${location.start.column}` : '?'
}

function relativeFile(filename: string | null): string {
  return filename ? path.relative(ROOT, filename).split(path.sep).join('/') : '(unknown file)'
}

/**
 * Collects the functions that React Compiler does not compile. A function that more than one build skips counts once.
 */
export const reactCompilerLogger: Logger = {
  logEvent(filename, event) {
    if (event.kind === 'CompileError') {
      const file = relativeFile(filename)
      const { reason } = event.detail
      skips.set([file, position(event.fnLoc), position(event.detail.primaryLocation()), reason].join('|'), {
        file,
        reason,
      })
    } else if (event.kind === 'PipelineError') {
      failures.push(`React Compiler failed in ${relativeFile(filename)}: ${event.data}`)
    }
  },
}

/** Counts the skipped functions of each file and reason, sorted by file and reason. */
export function countSkips(found: Iterable<Skip>): CompilerSkips[] {
  const counts = new Map<string, CompilerSkips>()
  for (const { file, reason } of found) {
    const key = `${file}|${reason}`
    const entry = counts.get(key) ?? { file, reason, count: 0 }
    entry.count++
    counts.set(key, entry)
  }
  return [...counts.values()].toSorted((a, b) => a.file.localeCompare(b.file) || a.reason.localeCompare(b.reason))
}

/** Returns the differences between the skipped functions of a build and {@link KNOWN_SKIPS}. */
export function skipDifferences(found: readonly CompilerSkips[], known: readonly CompilerSkips[]): string[] {
  const keyOf = (entry: CompilerSkips) => `${entry.file}|${entry.reason}`
  const knownCounts = new Map(known.map((entry) => [keyOf(entry), entry.count]))
  const foundCounts = new Map(found.map((entry) => [keyOf(entry), entry.count]))
  const problems: string[] = []
  for (const entry of found) {
    const expected = knownCounts.get(keyOf(entry)) ?? 0
    if (entry.count > expected) {
      problems.push(`Skipped now, not in KNOWN_SKIPS: ${entry.file}: ${entry.count - expected} × ${entry.reason}`)
    }
  }
  for (const entry of known) {
    const actual = foundCounts.get(keyOf(entry)) ?? 0
    if (actual < entry.count)
      problems.push(`In KNOWN_SKIPS, not skipped now: ${entry.file}: ${entry.count - actual} × ${entry.reason}`)
  }
  return problems
}

/** Fails the build when React Compiler fails, or when the functions that it skips differ from {@link KNOWN_SKIPS}. */
export function reactCompilerCheck(): Plugin {
  return {
    name: 'react-compiler-check',
    apply: 'build',
    buildStart() {
      skips.clear()
      failures.length = 0
    },
    closeBundle() {
      const problems = [...failures, ...skipDifferences(countSkips(skips.values()), KNOWN_SKIPS)]
      if (problems.length > 0) {
        this.error(
          `The functions that React Compiler skips differ from KNOWN_SKIPS in scripts/react-compiler.ts:\n${problems.join('\n')}`,
        )
      }
    },
  }
}
