import { describe, expect, it } from 'vitest'
import { defaultEdgeData, defaultPayloadField } from './defaults'
import {
  exampleBody,
  fieldIssues,
  fieldsFromExample,
  fieldsFromJsonText,
  mergeFields,
  parsePath,
  PayloadJsonError,
  payloadJson,
  stepBody,
  withPayload,
} from './payload'
import type { PayloadField } from './schema'

const field = (path: string, overrides: Partial<PayloadField> = {}) => defaultPayloadField({ path, ...overrides })

describe('parsePath', () => {
  it('reads names, nested names and array items', () => {
    expect(parsePath('customer.email')).toEqual([
      { kind: 'key', name: 'customer' },
      { kind: 'key', name: 'email' },
    ])
    expect(parsePath('items[].sku')).toEqual([
      { kind: 'key', name: 'items' },
      { kind: 'item' },
      { kind: 'key', name: 'sku' },
    ])
    expect(parsePath('[][]')).toEqual([{ kind: 'item' }, { kind: 'item' }])
    expect(parsePath(' first name ')).toEqual([{ kind: 'key', name: 'first name' }])
  })

  it('rejects paths that a body cannot hold', () => {
    for (const path of ['', '  ', 'a..b', 'a.', '.a', 'a.[]', 'a[b]', 'a[]b']) expect(parsePath(path), path).toBeNull()
  })
})

describe('exampleBody', () => {
  it('nests fields and gives each field its example or a value for its type', () => {
    const body = exampleBody([
      field('orderId', { example: 'ord_8f2k' }),
      field('total', { type: 'number', example: '49.5' }),
      field('paid', { type: 'boolean', example: 'false' }),
      field('customer', { type: 'object' }),
      field('customer.email'),
      field('items', { type: 'array' }),
      field('items[].sku', { example: 'LAMP-01' }),
      field('items[].qty', { type: 'number' }),
      field('tags[]', { example: 'gift' }),
      field('coupon', { type: 'null' }),
      field('empty', { type: 'object' }),
    ])
    expect(body).toEqual({
      orderId: 'ord_8f2k',
      total: 49.5,
      paid: false,
      customer: { email: 'string' },
      items: [{ sku: 'LAMP-01', qty: 0 }],
      tags: ['gift'],
      coupon: null,
      empty: {},
    })
  })

  it('builds a body that is an array', () => {
    expect(exampleBody([field('[].id', { type: 'number', example: '7' })])).toEqual([{ id: 7 }])
    expect(exampleBody([field('[]', { example: 'a' })])).toEqual(['a'])
  })

  it('skips fields with a path that it cannot read, and has no body without fields', () => {
    expect(exampleBody([field(''), field('a..b')])).toBeUndefined()
    expect(exampleBody([])).toBeUndefined()
  })

  it('keeps the children of a container when a later field gives it a value type', () => {
    expect(exampleBody([field('a.b'), field('a')])).toEqual({ a: { b: 'string' } })
  })
})

describe('fieldsFromExample', () => {
  it('reads paths, types, examples and required fields, and builds the same body again', () => {
    const body = {
      orderId: 'ord_8f2k',
      total: 49.5,
      paid: true,
      customer: { email: 'ada@example.com', address: { city: 'Aarhus' } },
      items: [{ sku: 'LAMP-01', qty: 1 }],
      tags: ['gift'],
      coupon: null,
      grid: [[1, 2]],
    }
    const fields = fieldsFromExample(body)
    expect(fields.map((item) => [item.path, item.type, item.example, item.required])).toEqual([
      ['orderId', 'string', 'ord_8f2k', true],
      ['total', 'number', '49.5', true],
      ['paid', 'boolean', 'true', true],
      ['customer', 'object', '', true],
      ['customer.email', 'string', 'ada@example.com', true],
      ['customer.address', 'object', '', true],
      ['customer.address.city', 'string', 'Aarhus', true],
      ['items', 'array', '', true],
      ['items[].sku', 'string', 'LAMP-01', true],
      ['items[].qty', 'number', '1', true],
      ['tags', 'array', '', true],
      ['tags[]', 'string', 'gift', true],
      ['coupon', 'null', '', true],
      ['grid', 'array', '', true],
      ['grid[]', 'array', '', true],
      ['grid[][]', 'number', '1', true],
    ])
    expect(new Set(fields.map((item) => item.id)).size).toBe(fields.length)
    expect(exampleBody(fields)).toEqual({ ...body, grid: [[1]] })
  })

  it('joins the keys of all array items, and marks a key that some items lack as not required', () => {
    const fields = fieldsFromExample({
      items: [{ sku: 'A' }, { sku: 'B', note: 'gift wrap' }, { sku: 'C', qty: null }],
    })
    expect(fields.map((item) => [item.path, item.type, item.required])).toEqual([
      ['items', 'array', true],
      ['items[].sku', 'string', true],
      ['items[].note', 'string', false],
      ['items[].qty', 'null', false],
    ])
  })

  it('reads a body that is an array', () => {
    expect(fieldsFromExample([{ id: 1 }]).map((item) => item.path)).toEqual(['[].id'])
    expect(fieldsFromExample(['a']).map((item) => item.path)).toEqual(['[]'])
  })

  it('rejects a body that is not an object or an array, and text that is not JSON', () => {
    expect(() => fieldsFromExample('text')).toThrow(PayloadJsonError)
    expect(() => fieldsFromExample(null)).toThrow(PayloadJsonError)
    expect(() => fieldsFromJsonText('{"sku": ')).toThrow(/not valid JSON/)
    expect(fieldsFromJsonText('{"sku": "A-1"}').map((item) => item.path)).toEqual(['sku'])
  })
})

describe('mergeFields', () => {
  it('keeps the id and the description of fields with the same path', () => {
    const existing = [field('sku', { description: 'The product code' }), field('gone')]
    const merged = mergeFields(existing, fieldsFromExample({ sku: 'A-1', qty: 2 }))
    expect(merged.map((item) => [item.path, item.description, item.example])).toEqual([
      ['sku', 'The product code', 'A-1'],
      ['qty', '', '2'],
    ])
    expect(merged[0]!.id).toBe(existing[0]!.id)
  })

  it('keeps the sensitive mark of fields with the same path', () => {
    const merged = mergeFields(
      [field('email', { sensitive: 'personal' })],
      fieldsFromExample({ email: 'a@b.c', id: 1 }),
    )
    expect(merged.map((item) => item.sensitive)).toEqual(['personal', undefined])
    expect(merged[1]).not.toHaveProperty('sensitive')
  })
})

describe('fieldIssues', () => {
  it('reports empty, unreadable and repeated names', () => {
    const fields = [field(''), field('a..b'), field('sku'), field(' sku ')]
    expect([...fieldIssues(fields).entries()]).toEqual([
      [fields[0]!.id, 'Give the field a name.'],
      [fields[1]!.id, 'Put dots between names, and [] after an array, for example items[].sku.'],
      [fields[3]!.id, 'Another field has this name.'],
    ])
  })

  it('reports a field inside a parent that cannot hold it', () => {
    const fields = [
      field('customer'),
      field('customer.email'),
      field('items', { type: 'object' }),
      field('items[].sku'),
    ]
    const issues = fieldIssues(fields)
    expect(issues.get(fields[1]!.id)).toBe('“customer” is a string. Make it an object to hold this field.')
    expect(issues.get(fields[3]!.id)).toBe('“items” is an object. Make it an array to hold this field.')
    expect(issues.size).toBe(2)
  })

  it('reports fields that do not match the body that the first field starts', () => {
    const fields = [field('id'), field('[].id')]
    expect(fieldIssues(fields).get(fields[1]!.id)).toBe('The body is an object, so this field cannot start with [].')
  })

  it('accepts the fields that it reads from an example', () => {
    expect(fieldIssues(fieldsFromExample({ a: { b: [{ c: 1 }] }, d: [[true]] })).size).toBe(0)
  })
})

describe('bodies of an edge', () => {
  const data = withPayload(
    withPayload(defaultEdgeData(), 'request', fieldsFromExample({ sku: 'A-1', qty: 2 })),
    'response',
    fieldsFromExample({ orderId: 'ord_1' }),
  )

  it('writes compact JSON for the log line, and the response while the token moves back', () => {
    expect(stepBody(data, false)).toBe('{"sku":"A-1","qty":2}')
    expect(stepBody(data, true)).toBe('{"orderId":"ord_1"}')
    expect(stepBody(defaultEdgeData(), false)).toBe('')
    expect(payloadJson(data.request, 2)).toBe('{\n  "sku": "A-1",\n  "qty": 2\n}')
  })

  it('removes a body that has no fields', () => {
    const cleared = withPayload(data, 'request', [])
    expect('request' in cleared).toBe(false)
    expect(cleared.response).toEqual(data.response)
  })
})
