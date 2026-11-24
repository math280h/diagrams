import { describe, expect, it } from 'vitest'
import { createDiagram } from '@/model/defaults'
import { setRepository } from './active-repository'
import { backupEntries, backupFileName } from './backup'
import { createCachedRepository } from './cached-repository'

describe('backupEntries', () => {
  it('names each file after its diagram, and numbers files with the same name', () => {
    const names = ['Order system', 'Order system', 'order  System!', '']
    setRepository(
      createCachedRepository({
        location: { kind: 'browser', budgetBytes: 1000 },
        files: names.map((name, index) => {
          const diagram = { ...createDiagram(), name, updatedAt: names.length - index }
          return { id: diagram.id, text: JSON.stringify(diagram) }
        }),
        sink: { write: async () => undefined, remove: async () => undefined },
      }),
    )
    expect(backupEntries().map((entry) => entry.name)).toEqual([
      'order-system.diagram.json',
      'order-system-2.diagram.json',
      'order-system-3.diagram.json',
      'diagram.diagram.json',
    ])
  })
})

describe('backupFileName', () => {
  it('holds the local date', () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 59))).toBe('diagrams-backup-2026-01-05.zip')
  })
})
