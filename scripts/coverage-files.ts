import type { Profiler } from 'node:inspector'

/** The files that the coverage reports measure, as globs relative to the repository root. */
export const COVERAGE_INCLUDE = ['src/**/*.{ts,tsx}', 'electron/**/*.ts', 'scripts/**/*.ts', 'actions/**/*.mjs']

/** The files in {@link COVERAGE_INCLUDE} that the coverage reports leave out. */
export const COVERAGE_EXCLUDE = ['**/*.test.{ts,mjs}', '**/*.d.ts']

/** The V8 coverage of one script in the browser, with the code that the dev server sent. */
export interface ScriptCoverage {
  url: string
  source: string
  functions: Profiler.FunctionCoverage[]
}
