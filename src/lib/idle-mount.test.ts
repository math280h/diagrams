import { describe, expect, it } from 'vitest'
import { createIdleQueue } from './idle-mount'

function setup() {
  const pending: (() => void)[] = []
  const queue = createIdleQueue((run) => pending.push(run))
  const idle = () => pending.shift()?.()
  return { queue, pending, idle }
}

describe('createIdleQueue', () => {
  it('runs one task for each idle moment, in order', () => {
    const { queue, pending, idle } = setup()
    const ran: string[] = []
    queue.add(() => ran.push('a'))
    queue.add(() => ran.push('b'))
    queue.add(() => ran.push('c'))
    expect(pending).toHaveLength(1)
    idle()
    expect(ran).toEqual(['a'])
    idle()
    idle()
    expect(ran).toEqual(['a', 'b', 'c'])
    expect(pending).toHaveLength(0)
  })

  it('skips a task that was removed before it ran', () => {
    const { queue, idle } = setup()
    const ran: string[] = []
    queue.add(() => ran.push('a'))
    const remove = queue.add(() => ran.push('b'))
    queue.add(() => ran.push('c'))
    remove()
    idle()
    idle()
    expect(ran).toEqual(['a', 'c'])
  })

  it('asks for a new idle moment after the queue ran empty', () => {
    const { queue, pending, idle } = setup()
    queue.add(() => undefined)
    idle()
    expect(pending).toHaveLength(0)
    queue.add(() => undefined)
    expect(pending).toHaveLength(1)
  })
})
