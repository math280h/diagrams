import { describe, expect, it } from 'vitest'
import { detectProtocol, edgeProtocol } from './protocols'

describe('detectProtocol', () => {
  it.each([
    ['HTTPS', 'http'],
    ['HTTP/2', 'http'],
    ['OData over VPN', 'http'],
    ['gRPC', 'rpc'],
    ['SQL', 'data'],
    ['replication', 'data'],
    ['PutItem', 'data'],
    ['publish', 'messaging'],
    ['poll outbox', 'messaging'],
    ['consume', 'messaging'],
  ] as const)('reads %s as %s', (label, protocol) => {
    expect(detectProtocol(label)).toBe(protocol)
  })

  it('finds no protocol in other labels', () => {
    expect(detectProtocol('Add to cart')).toBeNull()
    expect(detectProtocol('charge')).toBeNull()
    expect(detectProtocol('')).toBeNull()
  })
})

describe('edgeProtocol', () => {
  it('prefers the chosen protocol over the label', () => {
    expect(edgeProtocol({ protocol: 'data', label: 'HTTPS' })).toBe('data')
    expect(edgeProtocol({ protocol: 'none', label: 'gRPC' })).toBeNull()
    expect(edgeProtocol({ protocol: 'auto', label: 'gRPC' })).toBe('rpc')
  })
})
