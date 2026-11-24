import { beforeEach, describe, expect, it } from 'vitest'
import { zipEntries } from '@/lib/zip'
import { createDiagram } from '@/model/defaults'
import { DIAGRAM_VERSION, type Diagram } from '@/model/schema'
import { TEMPLATES } from '@/templates'
import { repository, setRepository } from './active-repository'
import { backupEntries } from './backup'
import { createCachedRepository } from './cached-repository'
import { importDiagramFiles } from './import-files'
import { diagramFileText } from './library-actions'
import type { DiagramRepository } from './repository'

const diagramFile = (diagram: unknown, name = 'diagram.diagram.json') =>
  new File([JSON.stringify(diagram)], name, { type: 'application/json' })

function useRepository(files: { id: string; text: string }[] = []): DiagramRepository {
  const next = createCachedRepository({
    location: { kind: 'folder', path: '/test' },
    files,
    sink: { write: async () => undefined, remove: async () => undefined },
  })
  setRepository(next)
  return next
}

function orderSystem(): Diagram {
  return TEMPLATES.find((template) => template.id === 'order-system')!.build()
}

function linkedPair(): [Diagram, Diagram] {
  const target = { ...createDiagram(), id: 'd_target', name: 'Payments' }
  const source = { ...orderSystem(), id: 'd_source' }
  const card = source.nodes.find((node) => node.type === 'card')!
  if (card.type === 'card') card.data.opens = target.id
  return [source, target]
}

function opensOf(diagram: Diagram | null): string | undefined {
  const card = diagram?.nodes.find((node) => node.type === 'card' && node.data.opens !== undefined)
  return card?.type === 'card' ? card.data.opens : undefined
}

async function zipFile(entries: { name: string; text: string }[], name = 'backup.zip'): Promise<File> {
  const zip = await zipEntries(
    entries.map((entry) => ({ name: entry.name, data: new TextEncoder().encode(entry.text) })),
  )
  return new File([zip], name, { type: 'application/zip' })
}

beforeEach(() => {
  useRepository()
})

describe('importDiagramFiles', () => {
  it('imports several diagram files and keeps their ids', async () => {
    const [source, target] = linkedPair()
    const report = await importDiagramFiles([diagramFile(source), diagramFile(target)])
    expect(report.imported.map((entry) => entry.id)).toEqual(['d_source', 'd_target'])
    expect(report).toMatchObject({ copies: [], unchanged: [], failed: [] })
    expect(repository().load('d_source')).toEqual(source)
    expect(opensOf(repository().load('d_source'))).toBe('d_target')
  })

  it('names each bad file with its reason and imports the others', async () => {
    const newer = { ...createDiagram(), version: DIAGRAM_VERSION + 1 }
    const report = await importDiagramFiles([
      new File(['not json'], 'notes.txt'),
      diagramFile({ hello: 'world' }, 'package.json'),
      diagramFile(newer, 'newer.diagram.json'),
      new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'plain.svg', { type: 'image/svg+xml' }),
      new File(['PK not really'], 'broken.zip'),
      diagramFile(createDiagram(), 'good.diagram.json'),
    ])
    expect(report.imported).toHaveLength(1)
    expect(report.failed).toEqual([
      { file: 'notes.txt', reason: expect.stringContaining('This file is not a diagram.') },
      { file: 'package.json', reason: expect.stringContaining('not a diagram that this app can read') },
      { file: 'newer.diagram.json', reason: expect.stringContaining('Update Diagrams to open it.') },
      { file: 'plain.svg', reason: expect.stringContaining('This image holds no diagram.') },
      { file: 'broken.zip', reason: 'This zip file is damaged or incomplete.' },
    ])
  })

  it('adds a copy when a different diagram has the id, and points links of the import at the copy', async () => {
    const [source, target] = linkedPair()
    const stored = { ...target, name: 'Payments, edited here' }
    useRepository([{ id: target.id, text: JSON.stringify(stored) }])

    const report = await importDiagramFiles([diagramFile(source), diagramFile(target)])
    expect(report.imported).toHaveLength(2)
    expect(report.copies).toEqual([{ id: expect.not.stringMatching(/^d_target$/), name: 'Payments' }])
    const copyId = report.copies[0]!.id
    expect(repository().load(target.id)).toEqual(stored)
    expect(repository().load(copyId)).toMatchObject({ name: 'Payments', rev: 0 })
    expect(opensOf(repository().load('d_source'))).toBe(copyId)
  })

  it('skips a diagram that is already stored with the same content', async () => {
    const diagram = orderSystem()
    useRepository([{ id: diagram.id, text: JSON.stringify(diagram) }])
    const report = await importDiagramFiles([diagramFile(diagram), diagramFile(diagram, 'again.diagram.json')])
    expect(report).toEqual({ imported: [], copies: [], unchanged: [expect.anything(), expect.anything()], failed: [] })
    expect(repository().list()).toHaveLength(1)
  })

  it('never replaces a stored diagram that the app cannot read', async () => {
    const diagram = createDiagram()
    useRepository([{ id: diagram.id, text: '{"broken"' }])
    const report = await importDiagramFiles([diagramFile(diagram)])
    expect(report.copies).toHaveLength(1)
    expect(repository().storedText(diagram.id)).toBe('{"broken"')
  })

  it('gives a new id to a second file with the same id and to an id that is not a safe file name', async () => {
    const first = createDiagram()
    const unsafe = { ...createDiagram(), id: '../outside' }
    const report = await importDiagramFiles([
      diagramFile(first),
      diagramFile({ ...first, name: 'Other' }),
      diagramFile(unsafe),
    ])
    const ids = report.imported.map((entry) => entry.id)
    expect(ids[0]).toBe(first.id)
    expect(ids.slice(1)).not.toContain(first.id)
    expect(ids).not.toContain('../outside')
    expect(new Set(ids).size).toBe(3)
  })

  it('reports a diagram that storage does not take', async () => {
    const full = useRepository()
    setRepository({ ...full, save: () => ({ ok: false, reason: 'quota', message: 'The browser storage is full.' }) })
    const report = await importDiagramFiles([diagramFile(createDiagram(), 'big.diagram.json')])
    expect(report.imported).toEqual([])
    expect(report.failed).toEqual([{ file: 'big.diagram.json', reason: 'The browser storage is full.' }])
  })
})

describe('import of a zip file', () => {
  it('restores a backup with the same ids and links', async () => {
    const [source, target] = linkedPair()
    useRepository([source, target].map((diagram) => ({ id: diagram.id, text: JSON.stringify(diagram) })))
    const entries = backupEntries()
    const backup = new File([await zipEntries(entries)], 'diagrams-backup.zip')

    useRepository()
    const report = await importDiagramFiles([backup])
    expect(report.failed).toEqual([])
    expect(repository().load('d_source')).toEqual(source)
    expect(repository().load('d_target')).toEqual(target)
    expect(opensOf(repository().load('d_source'))).toBe('d_target')
  })

  it('takes the stored text of an unreadable diagram into the backup, and names it at import', async () => {
    const readable = createDiagram()
    useRepository([
      { id: readable.id, text: JSON.stringify(readable) },
      { id: 'd_newer', text: JSON.stringify({ ...createDiagram(), id: 'd_newer', version: DIAGRAM_VERSION + 1 }) },
    ])
    const entries = backupEntries()
    expect(entries.map((entry) => new TextDecoder().decode(entry.data))).toContain(repository().storedText('d_newer'))

    useRepository()
    const report = await importDiagramFiles([new File([await zipEntries(entries)], 'backup.zip')])
    expect(report.imported.map((entry) => entry.id)).toEqual([readable.id])
    expect(report.failed).toEqual([
      { file: expect.stringMatching(/^backup\.zip\//), reason: expect.stringContaining('Update Diagrams') },
    ])
  })

  it('reads diagram files in folders and skips other files', async () => {
    const diagram = createDiagram()
    const report = await importDiagramFiles([
      await zipFile([
        { name: 'docs/a.diagram.json', text: diagramFileText(diagram) },
        { name: 'docs/README.md', text: '# Docs' },
        { name: '__MACOSX/docs/._a.diagram.json', text: 'junk' },
        { name: 'docs/.hidden.json', text: 'junk' },
      ]),
    ])
    expect(report).toEqual({
      imported: [{ id: diagram.id, name: diagram.name }],
      copies: [],
      unchanged: [],
      failed: [],
    })
  })

  it('says when a zip file holds no diagram files', async () => {
    const report = await importDiagramFiles([await zipFile([{ name: 'notes.txt', text: 'hello' }], 'notes.zip')])
    expect(report.failed).toEqual([{ file: 'notes.zip', reason: 'This zip file holds no diagram files.' }])
  })
})

const BACKUP_SAMPLES = import.meta.glob<string>('./backups/v*.zip', {
  eager: true,
  query: '?inline',
  import: 'default',
})
const FIELD_SAMPLES = import.meta.glob<{ diagrams: { id: string }[] }>('./formats/v*.fields.json', {
  eager: true,
  import: 'default',
})

function sampleFile(file: string): File {
  const url = BACKUP_SAMPLES[file]!
  const bytes = Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (character) => character.charCodeAt(0))
  return new File([bytes], file.slice(file.lastIndexOf('/') + 1))
}

describe('backups that a release wrote', () => {
  it('has a sample', () => {
    expect(Object.keys(BACKUP_SAMPLES)).toContain('./backups/v19.zip')
  })

  it.each(Object.keys(BACKUP_SAMPLES))('gives back the diagrams of %s', async (file) => {
    const version = /\/v(\d+)\.zip$/.exec(file)![1]
    const { diagrams } = FIELD_SAMPLES[`./formats/v${version}.fields.json`]!
    const report = await importDiagramFiles([sampleFile(file)])
    expect(report.failed).toEqual([])
    expect(report.imported.map((entry) => entry.id).toSorted()).toEqual(
      diagrams.map((diagram) => diagram.id).toSorted(),
    )
    for (const diagram of diagrams) {
      const imported = repository().load(diagram.id)
      expect(imported?.version).toBe(DIAGRAM_VERSION)
      if (Number(version) === DIAGRAM_VERSION) expect(JSON.parse(JSON.stringify(imported))).toEqual(diagram)
    }
  })
})
