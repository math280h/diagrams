import { beforeEach, describe, expect, it } from 'vitest'
import { closeProblem, showProblem, updateProblem, useProblemStore } from './problem-store'

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
