import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDiagram } from '@/model/defaults'
import { createDiagramFiles } from './diagram-files'
import { createLinkedFiles, linkedIdOf } from './linked-files'
import { createPickedFiles } from './picked-files'

let root: string
let folder: string
let repo: string
let registry: string

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'picked-files-'))
  folder = path.join(root, 'Diagrams')
  repo = path.join(root, 'repo')
  registry = path.join(root, 'user-data', 'linked-files.json')
  mkdirSync(folder)
  mkdirSync(repo)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function setup() {
  const files = createDiagramFiles(folder)
  const linked = createLinkedFiles(registry, {
    listedInFolder: async (linkedFiles) => (await files.idsOf(linkedFiles)).map((id) => id !== null),
  })
  return { files, linked, picked: createPickedFiles(files, linked) }
}

const texts = new Map<string, string>()
const diagramText = (name: string) => {
  const text = texts.get(name) ?? JSON.stringify(createDiagram(name))
  texts.set(name, text)
  return text
}
const linkedPaths = () =>
  existsSync(registry) ? (JSON.parse(readFileSync(registry, 'utf8')) as { files: string[] }).files : []

describe('createPickedFiles', () => {
  it('opens a file of the diagrams folder as its folder entry, and does not link it', async () => {
    writeFileSync(path.join(folder, 'd_orders.diagram.json'), diagramText('Orders'))
    const junction = path.join(root, 'Moved diagrams')
    symlinkSync(folder, junction, 'junction')
    const { picked, linked } = setup()

    const opened = await picked.open([
      path.join(folder, 'd_orders.diagram.json'),
      path.join(junction, 'themes', '..', 'd_orders.diagram.json'),
    ])
    expect(opened).toEqual([
      { id: 'd_orders', text: diagramText('Orders') },
      { id: 'd_orders', text: diagramText('Orders') },
    ])
    expect(await linked.readAll()).toEqual([])
    expect(linkedPaths()).toEqual([])
  })

  it('links a file outside the diagrams folder', async () => {
    const file = path.join(repo, 'orders.json')
    writeFileSync(file, diagramText('Orders'))
    const { picked } = setup()
    expect(await picked.open([file])).toEqual([{ id: linkedIdOf(file), text: diagramText('Orders'), path: file }])
    expect(linkedPaths()).toEqual([file])
  })

  it('links none of the picked files when one is not a diagram', async () => {
    const good = path.join(repo, 'orders.json')
    writeFileSync(good, diagramText('Orders'))
    const bad = path.join(repo, 'package.json')
    writeFileSync(bad, '{"name":"shop"}')
    const { picked } = setup()
    await expect(picked.open([good, bad])).rejects.toThrow('package.json is not a diagram.')
    expect(linkedPaths()).toEqual([])
  })

  it('saves into the diagrams folder as a folder file', async () => {
    const { picked, files } = setup()
    const saved = await picked.saveAs(path.join(folder, 'sub', '..', 'Plan.diagram.json'), diagramText('Plan'))
    expect(saved).toEqual({ id: 'Plan', text: diagramText('Plan') })
    expect(readFileSync(path.join(folder, 'Plan.diagram.json'), 'utf8')).toBe(diagramText('Plan'))
    expect((await files.readAll()).map((file) => file.id)).toEqual(['Plan'])
    expect(linkedPaths()).toEqual([])
  })

  it('saves over a file of the diagrams folder under its folder id', async () => {
    writeFileSync(path.join(folder, 'd_orders.diagram.json'), diagramText('Orders'))
    const junction = path.join(root, 'Moved diagrams')
    symlinkSync(folder, junction, 'junction')
    const { picked } = setup()
    const saved = await picked.saveAs(path.join(junction, 'd_orders.diagram.json'), diagramText('Orders v2'))
    expect(saved.id).toBe('d_orders')
    expect(readFileSync(path.join(folder, 'd_orders.diagram.json'), 'utf8')).toBe(diagramText('Orders v2'))
    expect(linkedPaths()).toEqual([])
  })

  it('links a file that it saves outside the diagrams folder, or under a name that the folder does not list', async () => {
    const { picked } = setup()
    const outside = path.join(repo, 'docs', 'plan.diagram.json')
    const notListed = path.join(folder, 'plan.json')
    expect(await picked.saveAs(outside, diagramText('Plan'))).toMatchObject({ id: linkedIdOf(outside), path: outside })
    expect(await picked.saveAs(notListed, diagramText('Plan'))).toMatchObject({ path: notListed })
    expect(linkedPaths()).toEqual([outside, notListed])
  })
})
