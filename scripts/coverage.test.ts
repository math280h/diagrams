import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as libCoverage from '@vitest/istanbul-lib-coverage'
import {
  addE2eHits,
  belowThresholds,
  coverageBadge,
  e2eCoverageData,
  inlineSourceMap,
  isMeasured,
  measuredFile,
  summaryTable,
} from './coverage.ts'

const ROOT = path.resolve('/repo')

describe('isMeasured', () => {
  it.each([
    ['src/editor/EditorPage.tsx', true],
    ['src/model/schema.ts', true],
    ['electron/main.ts', true],
    ['src/model/schema.test.ts', false],
    ['src/vite-env.d.ts', false],
    ['src/index.css', false],
    ['e2e/editor.spec.ts', false],
  ])('measures %s: %s', (file, measured) => {
    expect(isMeasured(file)).toBe(measured)
  })
})

describe('measuredFile', () => {
  it('returns the file of a source URL, without the query', () => {
    expect(measuredFile('http://127.0.0.1:5173/src/editor/EditorPage.tsx?t=1', ROOT)).toBe(
      path.join(ROOT, 'src', 'editor', 'EditorPage.tsx'),
    )
  })

  it('returns null for a URL outside the measured files', () => {
    expect(measuredFile('http://127.0.0.1:5173/src/index.css', ROOT)).toBeNull()
    expect(measuredFile('http://127.0.0.1:5173/node_modules/.vite/deps/react.js', ROOT)).toBeNull()
  })
})

describe('inlineSourceMap', () => {
  const fileUrl = pathToFileURL(path.join(ROOT, 'src', 'editor', 'EditorPage.tsx')).href
  const encode = (map: object) => Buffer.from(JSON.stringify(map)).toString('base64')

  it('reads the map at the end of the code and makes its sources absolute', () => {
    const code = `export const a = 1\n//# sourceMappingURL=data:application/json;base64,${encode({ version: 3, sources: ['EditorPage.tsx'], mappings: '' })}\n`
    expect(inlineSourceMap(code, fileUrl)?.sources).toEqual([fileUrl])
  })

  it('returns nothing for code without an inline map', () => {
    expect(inlineSourceMap('export const a = 1\n', fileUrl)).toBeUndefined()
  })
})

describe('belowThresholds', () => {
  const summary = { statements: { pct: 70 }, branches: { pct: 55 }, functions: { pct: 60 }, lines: { pct: 71 } }

  it('names each metric below its threshold', () => {
    expect(belowThresholds(summary, { statements: 69, branches: 56, functions: 60 })).toEqual([
      'branches: 55% is below the threshold of 56%',
    ])
  })
})

describe('e2eCoverageData', () => {
  it('converts the V8 coverage of a script to statement counts of its file', async () => {
    const source = 'export function pick(a) {\n  if (a) return 1\n  return 2\n}\npick(true)\n'
    const pickStart = source.indexOf('function pick')
    const pickEnd = source.indexOf('}') + 1
    const data = await e2eCoverageData(
      [
        {
          url: 'http://127.0.0.1:5173/src/pick.ts',
          source,
          functions: [
            {
              functionName: '',
              isBlockCoverage: false,
              ranges: [{ startOffset: 0, endOffset: source.length, count: 1 }],
            },
            {
              functionName: 'pick',
              isBlockCoverage: true,
              ranges: [
                { startOffset: pickStart, endOffset: pickEnd, count: 1 },
                { startOffset: source.indexOf('return 2'), endOffset: pickEnd - 1, count: 0 },
              ],
            },
          ],
        },
        { url: 'http://127.0.0.1:5173/src/index.css', source: 'x', functions: [] },
      ],
      ROOT,
    )
    expect(Object.keys(data)).toEqual([path.join(ROOT, 'src', 'pick.ts')])
    const summary = libCoverage
      .createCoverageMap(data)
      .fileCoverageFor(path.join(ROOT, 'src', 'pick.ts'))
      .toSummary()
    expect(summary.functions.covered).toBe(1)
    expect(summary.statements.covered).toBeGreaterThan(0)
    expect(summary.statements.covered).toBeLessThan(summary.statements.total)
  })
})

describe('addE2eHits', () => {
  const loc = (line: number, column: number, endColumn: number | null) => ({
    start: { line, column },
    end: { line, column: endColumn as number },
  })
  const unit = {
    '/repo/src/a.ts': {
      path: '/repo/src/a.ts',
      statementMap: { 0: loc(1, 0, 10), 1: loc(2, 2, 12), 2: loc(3, 2, 9) },
      s: { 0: 1, 1: 0, 2: 0 },
      fnMap: { 0: { name: 'f', decl: loc(1, 9, 10), loc: loc(1, 0, 20), line: 1 } },
      f: { 0: 0 },
      branchMap: { 0: { type: 'if', loc: loc(2, 2, 12), locations: [loc(2, 2, 12), loc(2, 2, 12)], line: 2 } },
      b: { 0: [0, 0] },
    },
    '/repo/src/b.ts': {
      path: '/repo/src/b.ts',
      statementMap: { 0: loc(1, 0, 5) },
      s: { 0: 0 },
      fnMap: {},
      f: {},
      branchMap: {},
      b: {},
    },
  } as unknown as libCoverage.CoverageMapData
  const e2e = {
    '/repo/src/a.ts': {
      path: '/repo/src/a.ts',
      statementMap: { 0: loc(2, 2, null), 1: loc(3, 2, 9), 2: loc(7, 0, 4) },
      s: { 0: 3, 1: 0, 2: 5 },
      fnMap: { 0: { name: 'f', decl: loc(1, 9, 10), loc: loc(1, 0, 30), line: 1 } },
      f: { 0: 2 },
      branchMap: { 0: { type: 'if', loc: loc(2, 2, null), locations: [loc(2, 2, 12), loc(2, 2, 12)], line: 2 } },
      b: { 0: [3, 0] },
    },
  } as unknown as libCoverage.CoverageMapData

  it('adds the hits of e2e entries that start at the same place, and keeps the unit entries', () => {
    const merged = addE2eHits(unit, e2e)['/repo/src/a.ts']!
    expect(merged.statementMap).toEqual(unit['/repo/src/a.ts']!.statementMap)
    expect(merged.s).toEqual({ 0: 1, 1: 3, 2: 0 })
    expect(merged.f).toEqual({ 0: 2 })
    expect(merged.b).toEqual({ 0: [3, 0] })
  })

  it('keeps a file without e2e coverage as it is', () => {
    expect(addE2eHits(unit, e2e)['/repo/src/b.ts']).toEqual(unit['/repo/src/b.ts'])
  })
})

describe('summaryTable', () => {
  it('writes the totals as a Markdown table', () => {
    const metric = { pct: 50, covered: 1, total: 2 }
    expect(summaryTable({ statements: metric, branches: metric, functions: metric, lines: metric }, 'Coverage')).toBe(
      [
        '### Coverage',
        '',
        '| | Percent | Covered |',
        '| --- | --- | --- |',
        '| Statements | 50% | 1 of 2 |',
        '| Branches | 50% | 1 of 2 |',
        '| Functions | 50% | 1 of 2 |',
        '| Lines | 50% | 1 of 2 |',
      ].join('\n'),
    )
  })
})

describe('coverageBadge', () => {
  const summary = (pct: number | 'Unknown') => ({
    statements: { pct: 0 },
    branches: { pct: 0 },
    functions: { pct: 0 },
    lines: { pct },
  })

  it('shows the line coverage, rounded down, with a colour for its range', () => {
    expect(coverageBadge(summary(78.9))).toEqual({
      schemaVersion: 1,
      label: 'coverage',
      message: '78%',
      color: 'yellowgreen',
    })
    expect(coverageBadge(summary(90)).color).toBe('brightgreen')
    expect(coverageBadge(summary(49.99)).color).toBe('red')
  })

  it('shows unknown when no line counts', () => {
    expect(coverageBadge(summary('Unknown'))).toMatchObject({ message: 'unknown', color: 'lightgrey' })
  })
})
