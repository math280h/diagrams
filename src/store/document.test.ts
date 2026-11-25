import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredFile } from '@/desktop/contract'
import { createDiagram } from '@/model/defaults'
import { DIAGRAM_VERSION, type Diagram } from '@/model/schema'
import { repository, setRepository } from '@/persistence/active-repository'
import { createCachedRepository } from '@/persistence/cached-repository'
import { deleteDiagram } from '@/persistence/library-actions'
import { memoryVersionStore, setVersionStore, versionStore } from '@/persistence/version-store'
import { DiagramFormatError, migrate } from '@/persistence/migrations'
import { localRepository } from '@/persistence/repository'
import { DiagramBuilder } from '@/templates/builder'
import { useDoc } from './doc-store'
import { undo, useHistory } from './history'
import {
  applyOutsideReview,
  cancelOutsideReview,
  chooseMerge,
  closeDiagramSession,
  currentDiagram,
  discardUnsavedChanges,
  flushPendingSave,
  keepOpenVersion,
  openDiagramId,
  openDiagramSession,
  outsideVersionWaits,
  SAVE_RETRY_DELAYS_MS,
  saveAndSettle,
  whenDiagramReady,
} from './document'
import { MERGE_PREVIEW_ID, useOutsideReview } from './outside-review'
import { useUnsaved } from './unsaved'
import { useVersions, versionsSettled } from './versions'

let saves = 0
let refuseSaves = false

function stored(name: string): Diagram {
  const diagram = createDiagram(name)
  repository().save(diagram)
  saves = 0
  return repository().load(diagram.id)!
}

function folderRepository() {
  return repository() as ReturnType<typeof createCachedRepository>
}

beforeEach(() => {
  // Sonner dismisses a toast in an animation frame. Node has no requestAnimationFrame.
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback))
  saves = 0
  refuseSaves = false
  const folder = createCachedRepository({
    location: { kind: 'folder', path: '/test' },
    files: [],
    sink: { write: async () => undefined, remove: async () => undefined },
  })
  const save = folder.save.bind(folder)
  folder.save = (diagram) => {
    saves++
    if (refuseSaves) return { ok: false, reason: 'quota', message: 'The storage is full.' }
    return save(diagram)
  }
  setRepository(folder)
  setVersionStore(memoryVersionStore())
})

afterEach(() => {
  const id = openDiagramId()
  if (id) closeDiagramSession(id, false)
  setVersionStore(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('diagram session', () => {
  it('saves a change after the delay, or at once on flush', () => {
    vi.useFakeTimers()
    try {
      const diagram = stored('Shop')
      openDiagramSession(diagram)
      useDoc.setState({ name: 'Store' })
      expect(saves).toBe(0)
      vi.advanceTimersByTime(400)
      expect(repository().load(diagram.id)?.name).toBe('Store')
      useDoc.setState({ name: 'Market' })
      flushPendingSave()
      expect(repository().load(diagram.id)?.name).toBe('Market')
    } finally {
      vi.useRealTimers()
    }
  })

  it('writes nothing when only the selection changed', () => {
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    useDoc.setState({ nodes: [...useDoc.getState().nodes] })
    flushPendingSave()
    expect(saves).toBe(0)
  })

  it('writes nothing for a selection in a diagram that a file load gave in another key order', () => {
    const b = new DiagramBuilder()
    const zone = b.group(0, 0, 640, 320, { label: 'VPC' })
    const api = b.card(40.125, 60, { title: 'API' }, 216, zone)
    const db = b.card(360, 60, { title: 'Orders DB' }, 216, zone)
    b.edge(api, db, { label: 'SQL' })
    const diagram = migrate(JSON.parse(JSON.stringify(b.build('Shop'))))
    openDiagramSession(diagram)
    useDoc.setState({ nodes: useDoc.getState().nodes.map((node) => ({ ...node, selected: node.id === api })) })
    flushPendingSave()
    expect(saves).toBe(0)
    useDoc.setState({ name: 'Store' })
    flushPendingSave()
    expect(saves).toBe(1)
  })

  it('drops the waiting save of a diagram that is deleted, also when its editor closes after', async () => {
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    useDoc.setState({ name: 'A change that waits for a save' })
    const deleted = deleteDiagram(diagram.id)
    closeDiagramSession(diagram.id)
    expect(repository().load(diagram.id)).toBeNull()
    expect(openDiagramId()).toBeNull()
    expect(await deleted).toEqual({ ok: true })
  })

  it('keeps the schema address of the user in the file of each save, and gives the next diagram its own', () => {
    const diagram = { $schema: './schemas/diagram.json', ...stored('Shop') }
    repository().save(diagram)
    openDiagramSession(repository().load(diagram.id)!)
    useDoc.setState({ name: 'Store' })
    flushPendingSave()
    expect(JSON.parse(repository().storedText(diagram.id)!)).toMatchObject({
      $schema: './schemas/diagram.json',
      name: 'Store',
    })
    const other = stored('Other')
    openDiagramSession(other)
    expect(currentDiagram()).not.toHaveProperty('$schema')
  })

  it('saves a diagram with the id of a deleted one after it opens again', async () => {
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    const deleted = deleteDiagram(diagram.id)
    repository().save(diagram)
    openDiagramSession(repository().load(diagram.id)!)
    useDoc.setState({ name: 'Back from the trash' })
    flushPendingSave()
    expect(repository().load(diagram.id)?.name).toBe('Back from the trash')
    expect(await deleted).toEqual({ ok: true })
  })
})

describe('changes from outside the editor', () => {
  it('loads a diagram that changed at once when no change waits for its save', async () => {
    const { toast } = await import('sonner')
    const warning = vi.spyOn(toast, 'warning')
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    folderRepository().applyExternal({
      kind: 'changed',
      id: diagram.id,
      text: JSON.stringify({ ...diagram, name: 'Edited outside', rev: 4 }),
    })
    expect(useDoc.getState()).toMatchObject({ name: 'Edited outside', rev: 4 })
    expect(warning).not.toHaveBeenCalled()
    flushPendingSave()
    expect(saves).toBe(0)
    warning.mockRestore()
  })

  it('loads a diagram that changed while only measured sizes and the viewport wait for their save', async () => {
    const { toast } = await import('sonner')
    const warning = vi.spyOn(toast, 'warning')
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    useDoc.setState((state) => ({
      nodes: state.nodes.map((node) => ({ ...node, measured: { width: 120, height: 48 } })),
      viewport: { x: 10, y: 20, zoom: 1.5 },
    }))
    folderRepository().applyExternal({
      kind: 'changed',
      id: diagram.id,
      text: JSON.stringify({ ...diagram, name: 'Edited by an agent' }),
    })
    expect(useDoc.getState().name).toBe('Edited by an agent')
    expect(warning).not.toHaveBeenCalled()
    flushPendingSave()
    expect(saves).toBe(0)
    warning.mockRestore()
  })

  it('offers the newer version while a change waits for its save, and says when its file is gone', async () => {
    const { toast } = await import('sonner')
    const warning = vi.spyOn(toast, 'warning')
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    useDoc.setState({ name: 'Edit that waits' })
    const folder = repository() as ReturnType<typeof createCachedRepository>

    folder.applyExternal({ kind: 'changed', id: diagram.id, text: JSON.stringify({ ...diagram, name: 'Edited' }) })
    expect(warning).toHaveBeenLastCalledWith(
      'This diagram changed on disk.',
      expect.objectContaining({ action: expect.anything() }),
    )

    folder.applyExternal({ kind: 'removed', id: diagram.id })
    expect(warning).toHaveBeenLastCalledWith(
      'The file of this diagram was deleted or moved.',
      expect.not.objectContaining({ action: expect.anything() }),
    )
    warning.mockRestore()
  })

  interface NoticeButtons {
    action: { label: string; onClick: (event: { preventDefault(): void }) => void }
    cancel: { label: string; onClick: () => void }
  }

  async function noticeButtons() {
    const { toast } = await import('sonner')
    const warning = vi.spyOn(toast, 'warning')
    const error = vi.spyOn(toast, 'error')
    const buttons = (spy: typeof warning) => spy.mock.lastCall?.[1] as unknown as NoticeButtons
    return { warning: () => buttons(warning), error: () => buttons(error) }
  }

  async function loadNewerAction() {
    const notice = await noticeButtons()
    return () => notice.warning().action.onClick({ preventDefault: () => undefined })
  }

  async function versionNames(id: string) {
    await versionsSettled()
    const metas = await versionStore().list(id)
    const diagrams = await Promise.all(metas.map((meta) => versionStore().load(meta.id)))
    return diagrams.map((diagram) => diagram?.name)
  }

  function newerFormat(diagram: Diagram) {
    return JSON.stringify({ ...diagram, version: DIAGRAM_VERSION + 1, name: 'From a newer app' })
  }

  it('loads the newer version on request and takes it as the saved state', async () => {
    const clickLoadNewer = await loadNewerAction()
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    useDoc.setState({ name: 'Edit that waits' })
    folderRepository().applyExternal({
      kind: 'changed',
      id: diagram.id,
      text: JSON.stringify({ ...diagram, name: 'Edited outside', rev: 7 }),
    })
    clickLoadNewer()
    expect(useDoc.getState()).toMatchObject({ name: 'Edited outside', rev: 7 })
    expect(useHistory.getState().canUndo).toBe(false)
    flushPendingSave()
    expect(saves).toBe(0)

    useDoc.setState({ name: 'Edited here' })
    flushPendingSave()
    expect(repository().load(diagram.id)).toMatchObject({ name: 'Edited here', rev: 8 })
  })

  it('says when the newer version cannot be read, and keeps the open version', async () => {
    const { toast } = await import('sonner')
    const error = vi.spyOn(toast, 'error')
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    folderRepository().applyExternal({ kind: 'changed', id: diagram.id, text: '{ broken' })
    expect(error).toHaveBeenCalledWith('The newer version cannot be read.', expect.anything())
    expect(useDoc.getState().name).toBe('Shop')
  })

  it('writes nothing over the newer version while the notice shows, also after the save delay', async () => {
    vi.useFakeTimers()
    try {
      const clickLoadNewer = await loadNewerAction()
      const diagram = stored('Shop')
      openDiagramSession(diagram)
      useDoc.setState({ name: 'Edit that waits' })
      folderRepository().applyExternal({
        kind: 'changed',
        id: diagram.id,
        text: JSON.stringify({ ...diagram, name: 'Edited outside', rev: 7 }),
      })
      vi.advanceTimersByTime(400)
      useDoc.setState({ name: 'Edit after the notice' })
      vi.advanceTimersByTime(400)
      flushPendingSave()
      expect(saves).toBe(0)
      expect(outsideVersionWaits()).toBe(true)

      clickLoadNewer()
      expect(useDoc.getState()).toMatchObject({ name: 'Edited outside', rev: 7 })
      expect(outsideVersionWaits()).toBe(false)
      expect(await versionNames(diagram.id)).toEqual(
        expect.arrayContaining(['Edit after the notice', 'Edited outside']),
      )
      flushPendingSave()
      expect(saves).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('saves this version over the newer one when the user keeps it', async () => {
    vi.useFakeTimers()
    try {
      const notice = await noticeButtons()
      const diagram = stored('Shop')
      openDiagramSession(diagram)
      useDoc.setState({ name: 'Edit that waits' })
      folderRepository().applyExternal({
        kind: 'changed',
        id: diagram.id,
        text: JSON.stringify({ ...diagram, name: 'Edited outside' }),
      })
      vi.advanceTimersByTime(400)
      expect(saves).toBe(0)

      expect(notice.warning().cancel.label).toBe('Review')
      keepOpenVersion()
      expect(repository().load(diagram.id)?.name).toBe('Edit that waits')
      expect(outsideVersionWaits()).toBe(false)

      useDoc.setState({ name: 'Edited later' })
      vi.advanceTimersByTime(400)
      expect(repository().load(diagram.id)?.name).toBe('Edited later')
    } finally {
      vi.useRealTimers()
    }
  })

  it('saves this version over the newer one when the user keeps it after an undo to the saved state', () => {
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    useDoc.setState({ name: 'Edit that waits' })
    folderRepository().applyExternal({
      kind: 'changed',
      id: diagram.id,
      text: JSON.stringify({ ...diagram, name: 'Edited outside' }),
    })
    useDoc.setState({ name: 'Shop' })
    keepOpenVersion()
    expect(repository().load(diagram.id)?.name).toBe('Shop')
  })

  it('never writes over a version from a newer app, and offers an export', async () => {
    vi.useFakeTimers()
    try {
      const notice = await noticeButtons()
      const diagram = stored('Shop')
      openDiagramSession(diagram)
      folderRepository().applyExternal({ kind: 'changed', id: diagram.id, text: newerFormat(diagram) })
      expect(notice.error().action.label).toBe('Export')

      useDoc.setState({ name: 'Edit after the notice' })
      vi.advanceTimersByTime(400)
      flushPendingSave()
      closeDiagramSession(diagram.id)
      expect(saves).toBe(0)
      expect(() => repository().load(diagram.id)).toThrow(DiagramFormatError)
      expect(await versionNames(diagram.id)).toContain('Edit after the notice')
    } finally {
      vi.useRealTimers()
    }
  })

  it('never writes over a version that it cannot read when the user tries to load it', async () => {
    vi.useFakeTimers()
    try {
      const clickLoadNewer = await loadNewerAction()
      const diagram = stored('Shop')
      openDiagramSession(diagram)
      useDoc.setState({ name: 'Edit that waits' })
      folderRepository().applyExternal({
        kind: 'changed',
        id: diagram.id,
        text: JSON.stringify({ ...diagram, name: 'Edited outside' }),
      })
      folderRepository().applyExternal({ kind: 'changed', id: diagram.id, text: newerFormat(diagram) })
      clickLoadNewer()
      vi.advanceTimersByTime(400)
      flushPendingSave()
      expect(saves).toBe(0)
      expect(useDoc.getState().name).toBe('Edit that waits')
      expect(outsideVersionWaits()).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('loads a version that it can read again at once when no change waits', () => {
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    folderRepository().applyExternal({ kind: 'changed', id: diagram.id, text: '{ half written' })
    folderRepository().applyExternal({
      kind: 'changed',
      id: diagram.id,
      text: JSON.stringify({ ...diagram, name: 'Written in full' }),
    })
    expect(useDoc.getState().name).toBe('Written in full')
    expect(outsideVersionWaits()).toBe(false)
    useDoc.setState({ name: 'Edited here' })
    flushPendingSave()
    expect(repository().load(diagram.id)?.name).toBe('Edited here')
  })

  it('saves the waiting changes again when the newer version is deleted', () => {
    vi.useFakeTimers()
    try {
      const diagram = stored('Shop')
      openDiagramSession(diagram)
      useDoc.setState({ name: 'Edit that waits' })
      folderRepository().applyExternal({
        kind: 'changed',
        id: diagram.id,
        text: JSON.stringify({ ...diagram, name: 'Edited outside' }),
      })
      vi.advanceTimersByTime(400)
      folderRepository().applyExternal({ kind: 'removed', id: diagram.id })
      expect(outsideVersionWaits()).toBe(false)
      vi.advanceTimersByTime(400)
      expect(repository().load(diagram.id)?.name).toBe('Edit that waits')
    } finally {
      vi.useRealTimers()
    }
  })

  function storedShop() {
    const b = new DiagramBuilder()
    const api = b.card(0, 0, { title: 'API' })
    const db = b.card(400, 0, { title: 'Orders DB' })
    b.edge(api, db)
    const diagram = b.build('Shop')
    repository().save(diagram)
    saves = 0
    return { diagram: repository().load(diagram.id)!, api, db }
  }

  function titleHere(nodeId: string, title: string) {
    useDoc.setState((state) => ({
      nodes: state.nodes.map((item) =>
        item.id === nodeId && item.type === 'card' ? { ...item, data: { ...item.data, title } } : item,
      ),
    }))
  }

  function storedNode(diagram: Diagram | null | undefined, nodeId: string) {
    return diagram?.nodes.find((item) => item.id === nodeId)
  }

  function changeOutside(diagram: Diagram, recipe: (draft: Diagram) => void) {
    const draft = structuredClone(diagram)
    recipe(draft)
    folderRepository().applyExternal({ kind: 'changed', id: diagram.id, text: JSON.stringify(draft) })
  }

  const titleThere = (nodeId: string, title: string) => (draft: Diagram) => {
    const found = storedNode(draft, nodeId)
    if (found?.type === 'card') found.data.title = title
  }

  const moveThere = (nodeId: string) => (draft: Diagram) =>
    void (storedNode(draft, nodeId)!.position = { x: 400, y: 200 })

  it('merges a version from outside without conflicts and writes the result once', async () => {
    vi.useFakeTimers()
    try {
      const notice = await noticeButtons()
      const { diagram, api, db } = storedShop()
      openDiagramSession(diagram)
      titleHere(api, 'Gateway')
      changeOutside(diagram, moveThere(db))
      vi.advanceTimersByTime(400)
      expect(saves).toBe(0)
      expect(notice.warning().action.label).toBe('Merge')
      expect(notice.warning().cancel.label).toBe('Review')

      notice.warning().action.onClick({ preventDefault: () => undefined })
      expect(saves).toBe(1)
      const saved = repository().load(diagram.id)
      expect(storedNode(saved, api)).toMatchObject({ data: { title: 'Gateway' } })
      expect(storedNode(saved, db)?.position).toEqual({ x: 400, y: 200 })
      expect(outsideVersionWaits()).toBe(false)
      vi.advanceTimersByTime(400)
      expect(saves).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('applies a reviewed merge with mixed choices as one undo step, once each conflict has a choice', async () => {
    const notice = await noticeButtons()
    const { diagram, api, db } = storedShop()
    openDiagramSession(diagram)
    titleHere(api, 'Gateway')
    useDoc.setState((state) => ({
      nodes: state.nodes.map((item) => (item.id === api ? { ...item, position: { x: 40, y: 40 } } : item)),
    }))
    changeOutside(diagram, (draft) => {
      titleThere(api, 'Edge API')(draft)
      storedNode(draft, api)!.position = { x: 80, y: 80 }
      moveThere(db)(draft)
    })
    expect(notice.warning().action.label).toBe('Load newer')
    expect(notice.warning()).toMatchObject({ description: '2 changes need a choice before your changes save.' })

    notice.warning().cancel.onClick()
    expect(useVersions.getState().previewId).toBe(MERGE_PREVIEW_ID)
    const review = useOutsideReview.getState().review!
    expect(review.result.conflicts.map((conflict) => conflict.key)).toEqual([
      `node:${api}:position`,
      `node:${api}:data.title`,
    ])
    chooseMerge([`node:${api}:data.title`], { kind: 'custom', value: 'Edge gateway' })
    applyOutsideReview()
    expect(outsideVersionWaits()).toBe(true)
    expect(saves).toBe(0)

    chooseMerge([`node:${api}:position`], { kind: 'mine' })
    applyOutsideReview()
    expect(useVersions.getState().previewId).toBeNull()
    expect(useOutsideReview.getState().review).toBeNull()
    expect(outsideVersionWaits()).toBe(false)
    expect(saves).toBe(1)
    const saved = repository().load(diagram.id)
    expect(storedNode(saved, api)).toMatchObject({ position: { x: 40, y: 40 }, data: { title: 'Edge gateway' } })
    expect(storedNode(saved, db)?.position).toEqual({ x: 400, y: 200 })

    undo()
    expect(storedNode(currentDiagram(), api)).toMatchObject({ position: { x: 40, y: 40 }, data: { title: 'Gateway' } })
    expect(storedNode(currentDiagram(), db)?.position).toEqual({ x: 400, y: 0 })
  })

  it('keeps the version from outside waiting when the user cancels the review', async () => {
    vi.useFakeTimers()
    try {
      const notice = await noticeButtons()
      const { diagram, api } = storedShop()
      openDiagramSession(diagram)
      titleHere(api, 'Gateway')
      changeOutside(diagram, titleThere(api, 'Edge API'))
      notice.warning().cancel.onClick()
      vi.advanceTimersByTime(400)
      cancelOutsideReview()
      expect(useOutsideReview.getState().review).toBeNull()
      expect(outsideVersionWaits()).toBe(true)
      expect(notice.warning().cancel.label).toBe('Review')
      vi.advanceTimersByTime(400)
      flushPendingSave()
      expect(saves).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('merges again when the version from outside changes during the review, and keeps the choices that still apply', async () => {
    const notice = await noticeButtons()
    const { diagram, api, db } = storedShop()
    openDiagramSession(diagram)
    titleHere(api, 'Gateway')
    changeOutside(diagram, titleThere(api, 'Edge API'))
    notice.warning().cancel.onClick()
    chooseMerge([`node:${api}:data.title`], { kind: 'theirs' })

    changeOutside(diagram, (draft) => {
      titleThere(api, 'Edge API')(draft)
      moveThere(db)(draft)
    })
    let review = useOutsideReview.getState().review!
    expect(review.choices.get(`node:${api}:data.title`)).toEqual({ kind: 'theirs' })
    expect(storedNode(review.result.diagram, db)?.position).toEqual({ x: 400, y: 200 })
    expect(useVersions.getState().preview?.diagram).toBe(review.result.diagram)

    changeOutside(diagram, moveThere(db))
    review = useOutsideReview.getState().review!
    expect(review.result.conflicts).toEqual([])
    expect(review.choices.size).toBe(0)
  })

  it('ignores changes of other diagrams', async () => {
    const { toast } = await import('sonner')
    const warning = vi.spyOn(toast, 'warning')
    const open = stored('Open')
    const other = stored('Other')
    openDiagramSession(open)
    folderRepository().applyExternal({ kind: 'changed', id: other.id, text: JSON.stringify({ ...other, name: 'B' }) })
    expect(warning).not.toHaveBeenCalled()
  })
})

describe('saves of the open diagram', () => {
  it('saves under the next rev', () => {
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    useDoc.setState({ name: 'Store' })
    flushPendingSave()
    expect(useDoc.getState().rev).toBe(diagram.rev + 1)
    expect(repository().load(diagram.id)?.rev).toBe(diagram.rev + 1)
  })

  it('keeps the rev of the last save when the storage refuses a save', () => {
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    refuseSaves = true
    useDoc.setState({ name: 'Store' })
    flushPendingSave()
    expect(saves).toBe(1)
    expect(useDoc.getState().rev).toBe(diagram.rev)
    expect(repository().load(diagram.id)?.name).toBe('Shop')
  })

  it('saves a change that waits when the page hides', () => {
    const page = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    const view = new EventTarget()
    vi.stubGlobal('document', page)
    vi.stubGlobal('window', view)
    const diagram = stored('Shop')
    openDiagramSession(diagram)

    useDoc.setState({ name: 'Store' })
    page.dispatchEvent(new Event('visibilitychange'))
    expect(saves).toBe(0)
    page.visibilityState = 'hidden'
    page.dispatchEvent(new Event('visibilitychange'))
    expect(repository().load(diagram.id)?.name).toBe('Store')

    useDoc.setState({ name: 'Market' })
    view.dispatchEvent(new Event('pagehide'))
    expect(repository().load(diagram.id)?.name).toBe('Market')

    closeDiagramSession(diagram.id)
    useDoc.setState({ id: diagram.id, name: 'After the editor closed' })
    view.dispatchEvent(new Event('pagehide'))
    expect(repository().load(diagram.id)?.name).toBe('Market')
  })

  it('saves nothing for a diagram that is not the open one', () => {
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    useDoc.setState({ name: 'Store' })
    useDoc.setState({ id: 'd_other' })
    flushPendingSave()
    expect(saves).toBe(0)
  })

  it('keeps the session when another diagram closes', () => {
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    closeDiagramSession('d_other')
    expect(openDiagramId()).toBe(diagram.id)
  })

  it('returns the open diagram in the stored form', () => {
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    expect(currentDiagram()).toMatchObject({ id: diagram.id, name: 'Shop', version: diagram.version })
  })
})

function browserStorage() {
  const items = new Map<string, string>()
  const state = { full: false, diagramWrites: 0 }
  vi.stubGlobal('localStorage', {
    get length() {
      return items.size
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (key.startsWith('dg:diagram:')) {
        state.diagramWrites++
        if (state.full) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      }
      items.set(key, value)
    },
    removeItem: (key: string) => void items.delete(key),
  })
  const view = new EventTarget()
  vi.stubGlobal('window', view)
  setRepository(localRepository)
  return { state, view }
}

function failingFolder() {
  const state = { refuse: false }
  const write = vi.fn(async (_file: StoredFile) => {
    if (state.refuse) throw new Error('EPERM: operation not permitted')
  })
  setRepository(
    createCachedRepository({
      location: { kind: 'folder', path: '/test' },
      files: [],
      sink: { write, remove: async () => undefined },
    }),
  )
  return { state, write }
}

describe('saves that fail', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('tries a failed browser save again on a timer, on flush and on the next change, until storage takes it', () => {
    const { state } = browserStorage()
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    state.full = true
    state.diagramWrites = 0

    useDoc.setState({ name: 'Store' })
    vi.advanceTimersByTime(400)
    expect(state.diagramWrites).toBe(1)
    expect(useUnsaved.getState().diagram).toMatchObject({ id: diagram.id, reason: 'quota' })
    vi.advanceTimersByTime(SAVE_RETRY_DELAYS_MS[0]!)
    expect(state.diagramWrites).toBe(2)
    flushPendingSave()
    expect(state.diagramWrites).toBe(3)
    useDoc.setState({ name: 'Market' })
    vi.advanceTimersByTime(400)
    expect(state.diagramWrites).toBe(4)
    expect(repository().load(diagram.id)?.name).toBe('Shop')

    state.full = false
    vi.advanceTimersByTime(SAVE_RETRY_DELAYS_MS.at(-1)!)
    expect(state.diagramWrites).toBe(5)
    expect(repository().load(diagram.id)?.name).toBe('Market')
    expect(useUnsaved.getState().diagram).toBeNull()
    vi.advanceTimersByTime(10 * SAVE_RETRY_DELAYS_MS.at(-1)!)
    flushPendingSave()
    expect(state.diagramWrites).toBe(5)
  })

  it('offers a change from another tab, and does not load it, while a change is not stored', async () => {
    const { toast } = await import('sonner')
    const warning = vi.spyOn(toast, 'warning')
    const { state, view } = browserStorage()
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    state.full = true
    useDoc.setState({ name: 'Store' })
    flushPendingSave()
    view.dispatchEvent(Object.assign(new Event('storage'), { key: `dg:diagram:${diagram.id}` }))
    expect(useDoc.getState().name).toBe('Store')
    expect(warning).toHaveBeenCalledWith('This diagram changed in another tab.', expect.anything())
  })

  it('keeps a change that did not reach storage when it merges a version from another tab', async () => {
    const { toast } = await import('sonner')
    const warning = vi.spyOn(toast, 'warning')
    const { state, view } = browserStorage()
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    state.full = true
    useDoc.setState({ name: 'Store' })
    flushPendingSave()
    expect(useUnsaved.getState().diagram).not.toBeNull()

    state.full = false
    const background = diagram.theme.background === 'grid' ? 'dots' : 'grid'
    const theirs = { ...diagram, theme: { ...diagram.theme, background } }
    localStorage.setItem(`dg:diagram:${diagram.id}`, JSON.stringify(theirs))
    view.dispatchEvent(Object.assign(new Event('storage'), { key: `dg:diagram:${diagram.id}` }))
    const notice = warning.mock.lastCall?.[1] as unknown as {
      action: { label: string; onClick: (event: { preventDefault(): void }) => void }
    }
    expect(notice.action.label).toBe('Merge')
    notice.action.onClick({ preventDefault: () => undefined })

    expect(repository().load(diagram.id)).toMatchObject({ name: 'Store', theme: { background } })
  })

  it('tries a file write that fails later again, and ends the state after a write reaches the file', async () => {
    const { state, write } = failingFolder()
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    await repository().settled()
    write.mockClear()
    state.refuse = true

    useDoc.setState({ name: 'Store' })
    expect(await saveAndSettle()).toMatchObject({ id: diagram.id, message: 'EPERM: operation not permitted' })
    expect(write).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(SAVE_RETRY_DELAYS_MS[0]!)
    await repository().settled()
    expect(write).toHaveBeenCalledTimes(2)
    expect(useUnsaved.getState().diagram).not.toBeNull()

    state.refuse = false
    expect(await saveAndSettle()).toBeNull()
    expect(write).toHaveBeenCalledTimes(3)
    expect(write).toHaveBeenLastCalledWith(expect.objectContaining({ text: expect.stringContaining('"Store"') }))
    await vi.advanceTimersByTimeAsync(10 * SAVE_RETRY_DELAYS_MS.at(-1)!)
    expect(write).toHaveBeenCalledTimes(3)
  })

  it('drops the changes that are not in the file on request, and stops the tries', async () => {
    const { state, write } = failingFolder()
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    await repository().settled()
    state.refuse = true
    useDoc.setState({ name: 'Store' })
    await saveAndSettle()
    write.mockClear()

    discardUnsavedChanges()
    expect(openDiagramId()).toBeNull()
    expect(useUnsaved.getState().diagram).toBeNull()
    expect(repository().load(diagram.id)?.name).toBe('Shop')
    await vi.advanceTimersByTimeAsync(10 * SAVE_RETRY_DELAYS_MS.at(-1)!)
    expect(write).not.toHaveBeenCalled()
  })

  it('ends the state and the tries when the editor closes', async () => {
    const { state, write } = failingFolder()
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    state.refuse = true
    useDoc.setState({ name: 'Store' })
    await saveAndSettle()
    closeDiagramSession(diagram.id, false)
    write.mockClear()
    expect(useUnsaved.getState().diagram).toBeNull()
    await vi.advanceTimersByTimeAsync(10 * SAVE_RETRY_DELAYS_MS.at(-1)!)
    expect(write).not.toHaveBeenCalled()
  })
})

describe('whenDiagramReady', () => {
  it('fails when no editor loads the diagram in time', async () => {
    vi.useFakeTimers()
    try {
      const waiting = expect(whenDiagramReady('d_never', 1000)).rejects.toThrow(
        'The diagram d_never did not open within 1000 ms.',
      )
      await vi.advanceTimersByTimeAsync(1000)
      await waiting
    } finally {
      vi.useRealTimers()
    }
  })
})
