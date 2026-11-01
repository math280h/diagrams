declare module '@bcoe/v8-coverage' {
  import type { Profiler } from 'node:inspector'

  /**
   * Merges the V8 coverage of one script from several runs.
   *
   * @returns The merged coverage, or `undefined` when the list is empty.
   */
  export function mergeScriptCovs(scriptCovs: readonly Profiler.ScriptCoverage[]): Profiler.ScriptCoverage | undefined
}
