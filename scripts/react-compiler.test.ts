import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LoggerEvent } from 'babel-plugin-react-compiler'
import { describe, expect, it } from 'vitest'
import { countSkips, KNOWN_SKIPS, reactCompilerCheck, reactCompilerLogger, skipDifferences } from './react-compiler.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FILE = path.join(ROOT, 'src', 'example', 'Example.tsx')

function location(line: number) {
  return {
    start: { line, column: 0, index: 0 },
    end: { line, column: 1, index: 1 },
    filename: FILE,
    identifierName: null,
  }
}

function compileError(reason: string, functionLine: number, errorLine: number): LoggerEvent {
  return {
    kind: 'CompileError',
    fnLoc: location(functionLine),
    detail: { reason, primaryLocation: () => location(errorLine) },
  } as unknown as LoggerEvent
}

function runBuild(events: LoggerEvent[]): string | null {
  const plugin = reactCompilerCheck()
  const call = (hook: unknown, context: object) => (hook as (this: object) => void).call(context)
  call(plugin.buildStart, {})
  for (const event of events) reactCompilerLogger.logEvent(FILE, event)
  for (const known of KNOWN_SKIPS) {
    for (let index = 0; index < known.count; index++) {
      reactCompilerLogger.logEvent(
        path.join(ROOT, known.file),
        compileError(known.reason, 10_000 + index, 10_000 + index),
      )
    }
  }
  try {
    call(plugin.closeBundle, {
      error(message: string) {
        throw new Error(message)
      },
    })
    return null
  } catch (error) {
    return (error as Error).message
  }
}

describe('countSkips', () => {
  it('counts the skips of each file and reason, sorted by file and reason', () => {
    expect(
      countSkips([
        { file: 'src/b.tsx', reason: 'x' },
        { file: 'src/a.tsx', reason: 'y' },
        { file: 'src/b.tsx', reason: 'x' },
        { file: 'src/a.tsx', reason: 'x' },
      ]),
    ).toEqual([
      { file: 'src/a.tsx', reason: 'x', count: 1 },
      { file: 'src/a.tsx', reason: 'y', count: 1 },
      { file: 'src/b.tsx', reason: 'x', count: 2 },
    ])
  })
})

describe('skipDifferences', () => {
  const known = [
    { file: 'src/a.tsx', reason: 'x', count: 2 },
    { file: 'src/b.tsx', reason: 'y', count: 1 },
  ]

  it('accepts the known skips', () => {
    expect(skipDifferences(known, known)).toEqual([])
  })

  it('names a new skip, a higher count and a skip that is gone', () => {
    expect(
      skipDifferences(
        [
          { file: 'src/a.tsx', reason: 'x', count: 3 },
          { file: 'src/c.tsx', reason: 'z', count: 1 },
        ],
        known,
      ),
    ).toEqual([
      'Skipped now, not in KNOWN_SKIPS: src/a.tsx: 1 × x',
      'Skipped now, not in KNOWN_SKIPS: src/c.tsx: 1 × z',
      'In KNOWN_SKIPS, not skipped now: src/b.tsx: 1 × y',
    ])
  })
})

describe('reactCompilerCheck', () => {
  it('passes when the build skips only the known functions', () => {
    expect(runBuild([])).toBeNull()
  })

  it('counts a function once when both builds compile it', () => {
    const skip = compileError('Handle Import expressions', 3, 4)
    expect(runBuild([skip, skip])).toContain(
      'Skipped now, not in KNOWN_SKIPS: src/example/Example.tsx: 1 × Handle Import expressions',
    )
  })

  it('counts two errors in different places separately', () => {
    const message = runBuild([
      compileError('Handle Import expressions', 3, 4),
      compileError('Handle Import expressions', 3, 9),
    ])
    expect(message).toContain('Skipped now, not in KNOWN_SKIPS: src/example/Example.tsx: 2 × Handle Import expressions')
  })

  it('fails when the compiler fails', () => {
    const failure = { kind: 'PipelineError', fnLoc: null, data: 'Invariant' } as LoggerEvent
    expect(runBuild([failure])).toContain('React Compiler failed in src/example/Example.tsx: Invariant')
  })

  it('forgets the skips of an earlier build', () => {
    runBuild([compileError('Handle Import expressions', 3, 4)])
    expect(runBuild([])).toBeNull()
  })
})
