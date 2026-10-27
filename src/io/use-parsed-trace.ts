import { useMemo } from 'react'
import { errorMessage } from '@/lib/error-message'
import { parseTraces, walkTrace, type Trace, type TraceWalk } from '@/import/trace'

export interface ParsedTrace {
  trace: Trace | null
  walk: TraceWalk | null
  /** The number of traces in the source. The import uses the one with the most spans. */
  traceCount: number
  error: string | null
}

const EMPTY: ParsedTrace = { trace: null, walk: null, traceCount: 0, error: null }

export function useParsedTrace(source: string): ParsedTrace {
  return useMemo(() => {
    if (!source.trim()) return EMPTY
    try {
      const traces = parseTraces(source)
      const trace = traces[0]!
      return { trace, walk: walkTrace(trace), traceCount: traces.length, error: null }
    } catch (cause) {
      return { ...EMPTY, error: errorMessage(cause) }
    }
  }, [source])
}
