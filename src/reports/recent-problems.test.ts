import { beforeEach, describe, expect, it } from 'vitest'
import {
  captureUncaughtErrors,
  forgetProblem,
  problemSubject,
  rememberProblem,
  UNCAUGHT_TITLE,
  useRecentProblems,
} from './recent-problems'

const problem = (title: string) => ({ title, message: `${title} failed.`, facts: [] })

describe('rememberProblem', () => {
  beforeEach(() => useRecentProblems.setState({ problems: [] }))

  it('keeps the newest problem first, once for a repeat, and at most 20', () => {
    rememberProblem(problem('Save'), 1000)
    rememberProblem(problem('Save'), 1500)
    rememberProblem(problem('Save'), 4000)
    expect(useRecentProblems.getState().problems.map((item) => item.time)).toEqual([4000, 1000])
    for (let index = 0; index < 30; index++) rememberProblem(problem(`Problem ${index}`), 10_000 + index)
    expect(useRecentProblems.getState().problems).toHaveLength(20)
    expect(useRecentProblems.getState().problems[0]?.problem.title).toBe('Problem 29')
  })

  it('keeps the same problem once, also when the app shows it again later', () => {
    const shown = problem('Export')
    rememberProblem(shown, 1000)
    rememberProblem(shown, 60_000)
    expect(useRecentProblems.getState().problems).toHaveLength(1)
    expect(problemSubject(shown)).toMatchObject({ kind: 'problem', problem: shown, time: 1000 })
  })

  it('forgets a problem', () => {
    rememberProblem(problem('Save'))
    forgetProblem(useRecentProblems.getState().problems[0]!.id)
    expect(useRecentProblems.getState().problems).toEqual([])
  })
})

describe('captureUncaughtErrors', () => {
  beforeEach(() => useRecentProblems.setState({ problems: [] }))

  it('keeps uncaught errors and rejections, but not the ResizeObserver loop message', () => {
    const target = new EventTarget() as unknown as Window
    const stop = captureUncaughtErrors(target)
    const error = new TypeError('x is undefined')
    target.dispatchEvent(Object.assign(new Event('error'), { message: error.message, error }))
    target.dispatchEvent(
      Object.assign(new Event('error'), { message: 'ResizeObserver loop completed with undelivered notifications.' }),
    )
    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new Error('Load failed') }))
    stop()
    target.dispatchEvent(Object.assign(new Event('error'), { message: 'after stop', error: new Error('after stop') }))
    const problems = useRecentProblems.getState().problems
    expect(problems.map((item) => [item.problem.title, item.problem.message])).toEqual([
      [UNCAUGHT_TITLE, 'Load failed'],
      [UNCAUGHT_TITLE, 'x is undefined'],
    ])
  })
})
