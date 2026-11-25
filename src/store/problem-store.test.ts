import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileLoadError } from '@/new-version/file-load'
import {
  closeProblem,
  explainFileLoadsWith,
  reportError,
  showProblem,
  updateProblem,
  useProblemStore,
} from './problem-store'

const toast = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const TAKEN = { title: 'Agents cannot connect', message: 'Port in use', facts: [] }
const ALL_TAKEN = { title: 'Agents cannot connect', message: 'All ports in use', facts: [] }
const EXPORT = { title: 'The image export failed.', message: 'No canvas', facts: [] }

beforeEach(() => closeProblem())

describe('problem store', () => {
  it('lets the source of a shown problem change it and close it when the problem ends', () => {
    showProblem(TAKEN, { key: 'agent-server' })
    updateProblem('agent-server', ALL_TAKEN)
    expect(useProblemStore.getState().problem).toBe(ALL_TAKEN)
    updateProblem('agent-server', null)
    expect(useProblemStore.getState()).toEqual({ problem: null, key: null })
  })

  it('keeps a problem of another source, and opens nothing for an update alone', () => {
    showProblem(EXPORT)
    updateProblem('agent-server', TAKEN)
    updateProblem('agent-server', null)
    expect(useProblemStore.getState().problem).toBe(EXPORT)
    closeProblem()
    updateProblem('agent-server', TAKEN)
    expect(useProblemStore.getState().problem).toBeNull()
  })
})

describe('reportError', () => {
  const missing = new FileLoadError('The layout worker did not load.')

  beforeEach(() => toast.error.mockClear())
  afterEach(() => explainFileLoadsWith(null))

  it('shows no error toast for a file that did not load when the explainer shows a notice', async () => {
    const explain = vi.fn(async () => true)
    explainFileLoadsWith(explain)
    reportError('Tidy up failed.', missing)
    await vi.waitFor(() => expect(explain).toHaveBeenCalledWith('Tidy up failed.', missing))
    await Promise.resolve()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('shows the error toast when the explainer shows nothing or fails', async () => {
    explainFileLoadsWith(async () => false)
    reportError('Tidy up failed.', missing)
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))

    explainFileLoadsWith(async () => {
      throw new Error('No network')
    })
    reportError('Tidy up failed.', missing)
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2))
    expect(toast.error).toHaveBeenLastCalledWith(
      'Tidy up failed.',
      expect.objectContaining({ description: missing.message }),
    )
  })

  it('asks the explainer only about files that did not load', () => {
    const explain = vi.fn(async () => true)
    explainFileLoadsWith(explain)
    reportError('Tidy up failed.', new Error('The graph has a cycle.'))
    expect(explain).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledTimes(1)
  })
})
