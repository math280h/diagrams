import { describe, expect, it } from 'vitest'
import { BOUNDARY_KINDS, BOUNDARY_PROVIDERS, boundaryKind, boundaryKindLabel, matchBoundary } from './boundaries'

describe('boundary kinds', () => {
  it('have unique ids and known providers', () => {
    const ids = BOUNDARY_KINDS.map((kind) => kind.id)
    expect(new Set(ids).size).toBe(ids.length)
    const providers = new Set(BOUNDARY_PROVIDERS.map((provider) => provider.id))
    for (const kind of BOUNDARY_KINDS) expect(providers.has(kind.provider)).toBe(true)
    for (const provider of providers) expect(BOUNDARY_KINDS.some((kind) => kind.provider === provider)).toBe(true)
  })

  it('names kinds in sentence case and keeps acronyms and product names', () => {
    expect(boundaryKindLabel(boundaryKind('aws.account'))).toBe('AWS account')
    expect(boundaryKindLabel(boundaryKind('aws.vpc'))).toBe('AWS VPC')
    expect(boundaryKindLabel(boundaryKind('aws.asg'))).toBe('AWS Auto Scaling group')
    expect(boundaryKindLabel(boundaryKind('azure.rg'))).toBe('Azure resource group')
    expect(boundaryKindLabel(boundaryKind('gcp.project'))).toBe('GCP project')
    expect(boundaryKindLabel(boundaryKind('general.trust'))).toBe('Trust boundary')
    expect(boundaryKindLabel(boundaryKind('custom'))).toBe('')
  })

  it('falls back to the custom group for unknown ids', () => {
    expect(boundaryKind('nope').tier).toBe('custom')
  })

  it('matches subgraph titles to kinds', () => {
    expect(matchBoundary('Azure subscription prod').id).toBe('azure.subscription')
    expect(matchBoundary('VPC').id).toBe('aws.vpc')
    expect(matchBoundary('Kubernetes cluster').id).toBe('k8s.cluster')
    expect(matchBoundary('Backend').id).toBe('custom')
  })
})
