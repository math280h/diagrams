import { describe, expect, it, vi } from 'vitest'
import { confirmUnsavedClose, diagramFileName, type CloseDialogs } from './unsaved-close'

const UNSAVED = { name: 'Shop: v2', text: '{"name":"Shop: v2"}\n' }
const SAVE_COPY = 0
const CLOSE = 1
const KEEP_OPEN = 2

function dialogs(answers: number[], files: (string | null)[] = []) {
  return {
    ask: vi.fn(async () => answers.shift() ?? KEEP_OPEN),
    pickFile: vi.fn(async () => files.shift() ?? null),
    write: vi.fn(async () => undefined),
    showError: vi.fn(async () => undefined),
  } satisfies CloseDialogs
}

describe('confirmUnsavedClose', () => {
  it('closes without saving or keeps the window open, as the user chooses', async () => {
    expect(await confirmUnsavedClose(UNSAVED, dialogs([CLOSE]))).toBe(true)
    const keep = dialogs([KEEP_OPEN])
    expect(await confirmUnsavedClose(UNSAVED, keep)).toBe(false)
    expect(keep.ask).toHaveBeenCalledWith(
      expect.objectContaining({ message: '“Shop: v2” is not saved', cancelId: KEEP_OPEN, defaultId: SAVE_COPY }),
    )
    expect(keep.write).not.toHaveBeenCalled()
  })

  it('saves a copy of the diagram file and then closes', async () => {
    const answers = dialogs([SAVE_COPY], ['/home/me/Shop v2.diagram.json'])
    expect(await confirmUnsavedClose(UNSAVED, answers)).toBe(true)
    expect(answers.pickFile).toHaveBeenCalledWith('Shop  v2.diagram.json')
    expect(answers.write).toHaveBeenCalledWith('/home/me/Shop v2.diagram.json', UNSAVED.text)
  })

  it('asks again after the user cancels the file choice or the copy fails', async () => {
    const answers = dialogs([SAVE_COPY, SAVE_COPY, KEEP_OPEN], [null, '/read-only/copy.diagram.json'])
    answers.write.mockRejectedValueOnce(new Error('EACCES: permission denied'))
    expect(await confirmUnsavedClose(UNSAVED, answers)).toBe(false)
    expect(answers.ask).toHaveBeenCalledTimes(3)
    expect(answers.showError).toHaveBeenCalledWith('Could not save the copy.', 'EACCES: permission denied')
  })
})

describe('diagramFileName', () => {
  it('replaces the characters that file systems refuse', () => {
    expect(diagramFileName('a/b\\c?')).toBe('a b c.diagram.json')
    expect(diagramFileName('  ')).toBe('Diagram.diagram.json')
  })
})
