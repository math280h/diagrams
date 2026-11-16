import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCrashStore } from './crash-store'

const DAY_MS = 24 * 60 * 60 * 1000
const START = Date.parse('2026-11-12T10:00:00Z')

describe('createCrashStore', () => {
  let folder: string
  let dumps: string
  let time: number

  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), 'crash-store-'))
    dumps = path.join(folder, 'Crashpad')
    time = START
  })

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true })
  })

  const store = () =>
    createCrashStore({
      logFile: path.join(folder, 'reports', 'crashes.json'),
      dumpsFolder: dumps,
      sessionFile: path.join(folder, 'reports', 'session.json'),
      now: () => time,
    })

  const addDump = async (id: string, modifiedAt: number, subfolder = 'reports') => {
    const file = path.join(dumps, subfolder, `${id}.dmp`)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, 'not a real minidump')
    await utimes(file, new Date(modifiedAt), new Date(modifiedAt))
    return file
  }

  it('joins a crash event with the dump of the same time', async () => {
    const crashes = store()
    await crashes.record({ process: 'renderer', reason: 'crashed', exitCode: -1 })
    await addDump('dump-a', START + 2000)
    const [crash] = await crashes.list()
    expect(crash).toMatchObject({
      id: 'dump-a',
      time: START,
      process: 'renderer',
      reason: 'crashed',
      exitCode: -1,
      seen: false,
      dump: { bytes: 19, exception: '', location: '' },
    })
  })

  it('lists an event without a dump, and a dump without an event', async () => {
    const crashes = store()
    await crashes.record({ process: 'gpu', reason: 'oom', exitCode: 3 })
    await addDump('dump-b', START - 10 * 60_000)
    const list = await crashes.list()
    expect(list.map((crash) => [crash.id, crash.process, crash.dump === null])).toEqual([
      [`event-${START}`, 'gpu', true],
      ['dump-b', 'unknown', false],
    ])
  })

  it('skips the dumps that Crashpad still writes', async () => {
    await addDump('unfinished', START, 'new')
    expect(await store().list()).toEqual([])
  })

  it('marks the dumps of a session that did not end as crashes of the main process', async () => {
    const first = store()
    await first.startSession()
    time = START + 60 * 60_000
    await addDump('main-crash', START + 30 * 60_000)
    const second = store()
    await second.startSession()
    expect((await second.list())[0]).toMatchObject({ id: 'main-crash', process: 'main' })

    second.endSession()
    expect(existsSync(path.join(folder, 'reports', 'session.json'))).toBe(false)
    await addDump('after-clean-end', time)
    await store().startSession()
    expect((await store().list()).find((crash) => crash.id === 'after-clean-end')?.process).toBe('unknown')
  })

  it('keeps the newest 5 dumps of the last 7 days', async () => {
    for (let index = 0; index < 7; index++) await addDump(`dump-${index}`, START - index * 60 * 60_000)
    await addDump('old', START - 8 * DAY_MS)
    const list = await store().list()
    expect(list.map((crash) => crash.id)).toEqual(['dump-0', 'dump-1', 'dump-2', 'dump-3', 'dump-4'])
    expect((await readdir(path.join(dumps, 'reports'))).toSorted()).toEqual(
      ['dump-0.dmp', 'dump-1.dmp', 'dump-2.dmp', 'dump-3.dmp', 'dump-4.dmp'].toSorted(),
    )
  })

  it('marks each crash seen, and deletes a crash with its dump and its event', async () => {
    const crashes = store()
    await crashes.record({ process: 'renderer', reason: 'crashed', exitCode: 1 })
    const file = await addDump('dump-c', START)
    await writeFile(file.replace(/\.dmp$/, '.meta'), 'metadata')
    expect((await crashes.markSeen()).every((crash) => crash.seen)).toBe(true)
    expect((await crashes.list())[0]?.seen).toBe(true)
    expect(await crashes.dumpFile('dump-c')).toBe(file)
    expect(await crashes.remove('dump-c')).toEqual([])
    expect(existsSync(file)).toBe(false)
    expect(existsSync(file.replace(/\.dmp$/, '.meta'))).toBe(false)
    expect(await crashes.dumpFile('dump-c')).toBeNull()
  })

  it('keeps a crash seen when its dump comes after the event', async () => {
    const crashes = store()
    await crashes.record({ process: 'renderer', reason: 'crashed', exitCode: 1 })
    await crashes.markSeen()
    await addDump('late-dump', START + 5000)
    expect(await crashes.list()).toMatchObject([{ id: 'late-dump', process: 'renderer', seen: true }])
  })

  it('deletes only the event of the deleted dump', async () => {
    const crashes = store()
    await crashes.record({ process: 'gpu', reason: 'crashed', exitCode: 1 })
    time = START + 1000
    await crashes.record({ process: 'renderer', reason: 'crashed', exitCode: 2 })
    await addDump('gpu-dump', START)
    await addDump('renderer-dump', START + 1000)
    const [newest] = await crashes.list()
    const rest = await crashes.remove(newest!.id)
    expect(rest).toHaveLength(1)
    expect(rest[0]?.process).not.toBe('unknown')
  })

  it('forgets events after 30 days', async () => {
    const crashes = store()
    await crashes.record({ process: 'utility', reason: 'crashed', exitCode: 1 })
    time = START + 31 * DAY_MS
    expect(await crashes.list()).toEqual([])
  })

  it('starts empty with a log file that is not valid', async () => {
    await mkdir(path.join(folder, 'reports'), { recursive: true })
    await writeFile(path.join(folder, 'reports', 'crashes.json'), '{ not json')
    expect(await store().list()).toEqual([])
  })
})
