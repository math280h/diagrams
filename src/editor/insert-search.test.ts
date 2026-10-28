import { describe, expect, it } from 'vitest'
import type { IconEntry } from '@/canvas/icons/library'
import { PRESETS } from '@/model/presets'
import { insertResults, presetScore } from './insert-search'

function entry(id: string, title: string, keywords: string[]): IconEntry {
  return { id, title, category: 'test', form: 'service', aliases: [title.toLowerCase()], keywords }
}

const ENTRIES = [
  entry('logo:postgresql', 'PostgreSQL', ['postgresql', 'postgres', 'sql', 'database']),
  entry('logo:redis', 'Redis', ['redis', 'cache']),
  entry('aws:lambda', 'AWS Lambda', ['aws', 'lambda', 'function', 'serverless']),
]

function names(query: string) {
  return insertResults(query, PRESETS, ENTRIES).map((result) =>
    result.kind === 'preset' ? result.preset.label : result.entry.title,
  )
}

describe('insertResults', () => {
  it('puts a product named by the search before a generic node that only lists it as a keyword', () => {
    expect(names('postgres')[0]).toBe('PostgreSQL')
    expect(names('postgres')).toContain('Database')
    expect(names('redis')[0]).toBe('Redis')
    expect(names('lambda')[0]).toBe('AWS Lambda')
  })

  it('puts a node named by the search first', () => {
    expect(names('database')[0]).toBe('Database')
    expect(names('cache')[0]).toBe('Cache')
  })

  it('leaves out names that only contain the letters of the search', () => {
    const vpc = names('vpc')
    expect(vpc.length).toBeGreaterThan(0)
    expect(vpc.every((name) => /vpc/i.test(name))).toBe(true)
  })

  it('scores a preset by its label before its keywords', () => {
    const database = PRESETS.find((preset) => preset.label === 'Database')!
    expect(presetScore(database, 'Database')).toBe(4)
    expect(presetScore(database, 'data')).toBe(3)
    expect(presetScore(database, 'mysql')).toBe(1)
    expect(presetScore(database, 'kafka')).toBe(0)
  })
})
