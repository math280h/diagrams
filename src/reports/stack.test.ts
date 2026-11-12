import { describe, expect, it } from 'vitest'
import { scriptFileName, stackFrames } from './stack'

describe('scriptFileName', () => {
  it.each([
    ['https://draw.example/assets/index-a1b2.js?v=1#x', 'index-a1b2.js'],
    ['file:///C:/Users/ana/AppData/Local/Programs/Diagrams/resources/app.asar/dist/main.js', 'main.js'],
    ['C:\\Users\\ana\\app\\main.js', 'main.js'],
    ['chrome-extension://abcdefgh/content.js', 'extension'],
    ['moz-extension://1234/content.js', 'extension'],
    ['node:internal/process/task_queues', 'node:internal/process/task_queues'],
    ['https://draw.example/', 'unknown'],
  ])('returns the file name of %s', (location, name) => {
    expect(scriptFileName(location)).toBe(name)
  })
})

describe('stackFrames', () => {
  it('reads the frames of Chromium and Node', () => {
    const stack = [
      'TypeError: Cannot read properties of undefined',
      '    at Object.save (https://draw.example/assets/index-a1b2.js:10:20)',
      '    at async run (file:///C:/Users/ana/app/main.js:3:4)',
      '    at new Store (https://draw.example/assets/store.js:1:2)',
      '    at https://draw.example/assets/anon.js:5:6',
      '    at eval (eval at load (https://draw.example/a.js:1:1), <anonymous>:7:8)',
    ].join('\n')
    expect(stackFrames(stack)).toEqual([
      { function: 'Object.save', file: 'index-a1b2.js', line: 10, column: 20 },
      { function: 'run', file: 'main.js', line: 3, column: 4 },
      { function: 'Store', file: 'store.js', line: 1, column: 2 },
      { function: '', file: 'anon.js', line: 5, column: 6 },
      { function: 'eval', file: 'anonymous', line: 7, column: 8 },
    ])
  })

  it('reads the frames of Firefox and Safari', () => {
    const stack = ['save@https://draw.example/assets/index.js:10:20', '@https://draw.example/assets/x.js:1:2', ''].join(
      '\n',
    )
    expect(stackFrames(stack)).toEqual([
      { function: 'save', file: 'index.js', line: 10, column: 20 },
      { function: '', file: 'x.js', line: 1, column: 2 },
    ])
  })

  it('reads no frame from the message of a Chromium stack', () => {
    const stack = ['Error: no access for ana@host.example:1:2', '    at save (https://draw.example/index.js:1:2)'].join(
      '\n',
    )
    expect(stackFrames(stack)).toEqual([{ function: 'save', file: 'index.js', line: 1, column: 2 }])
  })

  it('keeps at most 20 frames', () => {
    const stack = Array.from(
      { length: 30 },
      (_, index) => `    at f${index} (https://draw.example/a.js:${index}:1)`,
    ).join('\n')
    expect(stackFrames(stack)).toHaveLength(20)
  })
})
