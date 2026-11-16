import { describe, expect, it } from 'vitest'
import { errorProblem } from '@/lib/problem-report'
import { crashTitle, reportFromCrash, reportFromProblem, type ReportContext } from './build'
import { createRedactor } from './redact'
import { reportJson, reportSchema } from './report'

const CANARY = 'Zq7canary'

function context(sensitive: string[] = []): ReportContext {
  return {
    app: { version: '1.2.3', surface: 'desktop', channel: 'release' },
    system: { os: 'windows', browser: 'Chrome 142', electron: '41.0.0' },
    page: 'editor',
    time: new Date('2026-11-12T10:00:00Z'),
    redact: createRedactor(sensitive),
  }
}

describe('reportFromProblem', () => {
  it('keeps the error name and the frames, without the stack lines in the facts', () => {
    const error = new TypeError('The save failed.')
    error.stack = ['TypeError: The save failed.', '    at save (https://draw.example/assets/index-a1b2.js:10:20)'].join(
      '\n',
    )
    const report = reportFromProblem(errorProblem('Could not save', error, ['State: saving']), context())
    expect(reportSchema.parse(report)).toEqual(report)
    expect(report).toMatchObject({
      kind: 'error',
      time: '2026-11-12T10:00:00.000Z',
      title: 'Could not save',
      message: 'The save failed.',
      facts: ['State: saving'],
      error: 'TypeError',
      frames: [{ function: 'save', file: 'index-a1b2.js', line: 10, column: 20 }],
      crash: null,
      note: '',
    })
  })

  it('names an error with a name that is not an identifier Error', () => {
    const error = new Error('x')
    error.name = 'Failed for ana lima'
    expect(reportFromProblem(errorProblem('Failed', error), context()).error).toBe('Error')
  })

  it('keeps the facts of a problem without an error', () => {
    const report = reportFromProblem({ title: 'Lost', message: 'Gone.', facts: ['at home', 'Error: none'] }, context())
    expect(report.facts).toEqual(['at home', 'Error: none'])
    expect(report.frames).toEqual([])
  })

  it('leaves no private value in the report text', () => {
    const home = `C:\\Users\\${CANARY} Lima`
    const diagramText = `${CANARY} payment plan`
    const token = `tok${CANARY}9876543210abcdefXYZ`
    const error = new Error(`Could not open ${home}\\Documents\\Diagrams\\plan.json for ${CANARY}@example.com`)
    error.stack = [
      `Error: message with ${CANARY}@host.example:1:2`,
      `    at ${CANARY}Fn (file:///${home.replaceAll('\\', '/')}/AppData/app.asar/dist/main.js:1:2)`,
      `    at load (https://${CANARY}.example/${CANARY}/index.js:3:4)`,
    ].join('\n')
    const problem = errorProblem(`Could not open ${diagramText}`, error, [
      `Folder: /home/${CANARY}/Diagrams/a b/c.json`,
      `Server: http://${CANARY}.example:8080/v1`,
      `Token: ${token}`,
      `Home: ~/${CANARY}/x`,
      `Share: \\\\${CANARY}\\share\\x`,
      `Diagram: ${diagramText}`,
    ])
    const report = reportFromProblem(problem, context([home, diagramText, token, `${CANARY}Fn`]))
    const json = reportJson(report)
    expect(json.toLowerCase()).not.toContain(CANARY.toLowerCase())
  })
})

describe('reportFromCrash', () => {
  it('names the process that stopped', () => {
    expect(crashTitle({ process: 'renderer' })).toBe('The app window stopped')
    expect(crashTitle({ process: 'gpu' })).toBe('The graphics process stopped')
    expect(crashTitle({ process: 'Pepper Plugin' })).toBe('A process of the app stopped')
  })

  it('keeps the crash facts after the removal rules', () => {
    const crash = {
      process: 'renderer',
      reason: 'crashed',
      exitCode: -1073741819,
      exception: 'EXCEPTION_ACCESS_VIOLATION',
      location: `C:\\Users\\${CANARY}\\x.dll+0x10`,
    }
    const report = reportFromCrash(crash, context())
    expect(reportSchema.parse(report)).toEqual(report)
    expect(report.title).toBe('The app window stopped')
    expect(report.crash).toMatchObject({ process: 'renderer', reason: 'crashed', exitCode: -1073741819 })
    expect(reportJson(report)).not.toContain(CANARY)
  })
})
