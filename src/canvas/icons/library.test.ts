import { describe, expect, it } from 'vitest'
import { matchIcon, searchIcons, type IconEntry, type IconSet } from './library'

function entry(id: string, title: string, aliases: string[], keywords: string[] = []): IconEntry {
  return {
    id,
    title,
    category: 'Test',
    form: 'service',
    aliases,
    keywords: [...title.toLowerCase().split(' '), ...keywords],
  }
}

function set(source: IconSet['source'], entries: IconEntry[]): IconSet {
  return { source, entries, art: {}, byId: new Map(entries.map((item) => [item.id, item])) }
}

const SETS = [
  set('aws', [
    entry('aws:s3', 'Amazon S3', ['s3', 'amazon s3'], ['bucket', 'object']),
    entry('aws:s3-bucket', 'S3 bucket', ['s3 bucket']),
    entry('aws:lambda', 'AWS Lambda', ['lambda', 'aws lambda'], ['serverless', 'function']),
    entry('aws:sqs', 'Amazon SQS', ['sqs'], ['queue']),
  ]),
  set('gcp', [entry('gcp:pubsub', 'Pub/Sub', ['pub/sub', 'pubsub'], ['messaging'])]),
  set('logo', [
    entry('logo:redis', 'Redis', ['redis']),
    entry('logo:postgresql', 'PostgreSQL', ['postgresql', 'postgres']),
    entry('logo:go', 'Go', ['go', 'golang']),
  ]),
]

describe('matchIcon', () => {
  it('matches an alias or an alias with a role word', () => {
    expect(matchIcon(SETS, 'Lambda')?.id).toBe('aws:lambda')
    expect(matchIcon(SETS, 'Postgres DB')?.id).toBe('logo:postgresql')
    expect(matchIcon(SETS, 'Redis cache')?.id).toBe('logo:redis')
    expect(matchIcon(SETS, 'Go service')?.id).toBe('logo:go')
    expect(matchIcon(SETS, 'Pub/Sub topic')?.id).toBe('gcp:pubsub')
  })

  it('prefers the longest alias', () => {
    expect(matchIcon(SETS, 'S3 bucket')?.id).toBe('aws:s3-bucket')
    expect(matchIcon(SETS, 'S3')?.id).toBe('aws:s3')
  })

  it('ignores labels that only contain a name', () => {
    expect(matchIcon(SETS, 'Go to checkout')).toBeUndefined()
    expect(matchIcon(SETS, 'Orders service')).toBeUndefined()
    expect(matchIcon(SETS, 'API')).toBeUndefined()
  })
})

describe('searchIcons', () => {
  it('ranks an exact alias first and needs every word', () => {
    expect(searchIcons(SETS, 'sqs').map((item) => item.id)).toEqual(['aws:sqs'])
    expect(searchIcons(SETS, 's3')[0]?.id).toBe('aws:s3')
    expect(searchIcons(SETS, 'serverless func').map((item) => item.id)).toEqual(['aws:lambda'])
    expect(searchIcons(SETS, 'redis bucket')).toEqual([])
  })

  it('returns nothing for an empty text', () => {
    expect(searchIcons(SETS, '  ')).toEqual([])
  })
})
