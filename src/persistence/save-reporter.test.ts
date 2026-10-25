import { describe, expect, it, vi } from 'vitest'
import { createSaveReporter } from './save-reporter'

const FULL = { kind: 'save-failed', id: 'a', reason: 'quota', message: 'full' } as const
const DENIED = { kind: 'save-failed', id: 'a', reason: 'unknown', message: 'EPERM' } as const

function setup() {
  const show = { saveFailed: vi.fn(), removeFailed: vi.fn() }
  return { show, report: createSaveReporter(show) }
}

describe('createSaveReporter', () => {
  it('shows a run of failed saves once', () => {
    const { show, report } = setup()
    report(FULL)
    report(DENIED)
    report(FULL)
    expect(show.saveFailed).toHaveBeenCalledTimes(1)
    expect(show.saveFailed).toHaveBeenCalledWith(FULL)
  })

  it('shows a failure again after a save reaches storage', () => {
    const { show, report } = setup()
    report(DENIED)
    report({ kind: 'saved', id: 'a' })
    report(DENIED)
    expect(show.saveFailed).toHaveBeenCalledTimes(2)
  })

  it('shows each failed remove and ignores outside changes', () => {
    const { show, report } = setup()
    report({ kind: 'remove-failed', id: 'a', message: 'in use' })
    report({ kind: 'remove-failed', id: 'b', message: 'in use' })
    report({ kind: 'changed', id: 'a' })
    expect(show.removeFailed).toHaveBeenCalledTimes(2)
    expect(show.saveFailed).not.toHaveBeenCalled()
  })
})
