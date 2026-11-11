import { describe, expect, it } from 'vitest'
import { createDiagram } from '@/model/defaults'
import type { RepositoryEvent } from '@/persistence/repository'
import { readFollowedFolder } from './followed-files'

function picked(path: string, read: () => string) {
  return {
    name: path.split('/').at(-1)!,
    webkitRelativePath: path,
    text: async () => read(),
  } as unknown as File
}

function diagramText(name: string) {
  return JSON.stringify({ ...createDiagram(name), id: 'ignored' })
}

describe('readFollowedFolder', () => {
  it('reads the diagram files at the top of the folder and names the folder', async () => {
    const followed = await readFollowedFolder([
      picked('project/d_shop.diagram.json', () => diagramText('Shop')),
      picked('project/notes.md', () => '# Notes'),
      picked('project/old/d_old.diagram.json', () => diagramText('Old')),
    ])
    expect(followed?.name).toBe('project')
    expect(followed?.repository.location).toEqual({ kind: 'followed-folder', name: 'project' })
    expect(followed?.repository.list().map((meta) => meta.id)).toEqual(['d_shop'])
    expect(followed?.repository.load('d_shop')?.name).toBe('Shop')
  })

  it('gives a changed file to the repository, and keeps the diagram of a file that it cannot read again', async () => {
    let content = diagramText('Shop')
    let readable = true
    const followed = (await readFollowedFolder([
      picked('project/d_shop.diagram.json', () => {
        if (!readable) throw new DOMException('The file changed.', 'NotReadableError')
        return content
      }),
    ]))!
    const events: RepositoryEvent[] = []
    followed.repository.subscribe((event) => events.push(event))

    expect(await followed.poll()).toEqual([])
    expect(events).toEqual([])
    content = diagramText('Store')
    expect(await followed.poll()).toEqual([])
    expect(events).toEqual([{ kind: 'changed', id: 'd_shop' }])
    expect(followed.repository.load('d_shop')?.name).toBe('Store')

    readable = false
    expect(await followed.poll()).toEqual(['d_shop'])
    expect(followed.repository.load('d_shop')?.name).toBe('Store')
  })

  it('saves nowhere, and gives nothing for an empty folder', async () => {
    const followed = (await readFollowedFolder([picked('project/d_a.diagram.json', () => diagramText('A'))]))!
    expect(followed.repository.save({ ...createDiagram('A'), id: 'd_a', name: 'Changed here' })).toEqual({ ok: true })
    expect(followed.repository.load('d_a')?.name).toBe('Changed here')
    expect(await readFollowedFolder([])).toBeNull()
  })
})
