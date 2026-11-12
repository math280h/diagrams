import { describe, expect, it } from 'vitest'
import { errorProblem, problemReport } from './problem-report'

describe('errorProblem', () => {
  it('gives an error its message, its name and the start of its stack', () => {
    const error = new TypeError('Cannot read the nodes')
    error.stack = [
      'TypeError: Cannot read the nodes',
      '    at exportImage (app://diagrams/assets/export-abc.js:12:34)',
      '    at onClick (app://diagrams/assets/index-def.js:56:78)',
    ].join('\n')
    expect(errorProblem('The image export failed.', error, ['Format: PNG'])).toEqual({
      title: 'The image export failed.',
      message: 'Cannot read the nodes',
      facts: [
        'Format: PNG',
        'Error: TypeError',
        'at exportImage (app://diagrams/assets/export-abc.js:12:34)',
        'at onClick (app://diagrams/assets/index-def.js:56:78)',
      ],
      error: { name: 'TypeError', stack: error.stack },
    })
  })

  it('keeps at most eight stack lines', () => {
    const error = new Error('Deep')
    error.stack = ['Error: Deep', ...Array.from({ length: 20 }, (_, index) => `    at f${index} (a.js:1:1)`)].join('\n')
    expect(errorProblem('Failed', error).facts).toHaveLength(1 + 8)
  })

  it('takes a message that is not an error as it is', () => {
    expect(errorProblem('The save failed.', 'EPERM: operation not permitted', ['Reason: unknown'])).toEqual({
      title: 'The save failed.',
      message: 'EPERM: operation not permitted',
      facts: ['Reason: unknown'],
    })
  })
})

describe('problemReport', () => {
  it('puts the app, the title, the message and the facts on their own lines', () => {
    expect(problemReport('Diagrams 0.3.0, macOS 15.1 (arm64)', { title: 'T', message: 'M', facts: ['F1', 'F2'] })).toBe(
      'Diagrams 0.3.0, macOS 15.1 (arm64)\nT\nM\nF1\nF2',
    )
  })
})
