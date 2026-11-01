import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { parseTraces, TraceImportError } from './trace'

const value = fc.oneof(fc.jsonValue(), fc.string(), fc.integer(), fc.constant(null))
const attributes = fc.array(
  fc.record({ key: fc.oneof(fc.string(), value), value: fc.oneof(value, fc.record({ stringValue: value })) }),
  { maxLength: 4 },
)
const span = fc.record(
  {
    traceId: value,
    spanId: value,
    parentSpanId: value,
    name: value,
    kind: value,
    startTimeUnixNano: value,
    endTimeUnixNano: value,
    attributes: fc.oneof(attributes, value),
    id: value,
    parentId: value,
    timestamp: value,
    duration: value,
    localEndpoint: fc.oneof(fc.record({ serviceName: value }), value),
    operationName: value,
    references: fc.oneof(fc.array(fc.record({ refType: value, spanID: value }), { maxLength: 2 }), value),
    process: fc.oneof(fc.record({ serviceName: value }), value),
  },
  { requiredKeys: [] },
)
const spans = fc.array(span, { maxLength: 6 })
const traceFile = fc.oneof(
  fc.record({
    resourceSpans: fc.array(
      fc.record({ resource: fc.record({ attributes }), scopeSpans: fc.array(fc.record({ spans })) }),
    ),
  }),
  fc.record({
    data: fc.array(
      fc.record({ traceID: value, spans, processes: fc.dictionary(fc.string(), fc.record({ serviceName: value })) }),
    ),
  }),
  spans,
  fc.jsonValue(),
)

describe('trace input', () => {
  it('reads any text as traces or rejects it with a trace error', () => {
    const text = fc.oneof(
      fc.string(),
      traceFile.map((data) => JSON.stringify(data)),
    )
    fc.assert(
      fc.property(text, (source) => {
        try {
          const traces = parseTraces(source)
          expect(traces.length).toBeGreaterThan(0)
        } catch (error) {
          expect(error).toBeInstanceOf(TraceImportError)
        }
      }),
      { numRuns: 500 },
    )
  })
})
