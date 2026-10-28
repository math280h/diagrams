import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseRenderArgs, RenderUsageError } from './render-args'

const app = ['Diagrams.exe']

describe('render arguments', () => {
  it('ignores a command line without --render', () => {
    expect(parseRenderArgs([...app])).toBeNull()
    expect(parseRenderArgs([...app, '.', 'diagrams://receive?code=x'])).toBeNull()
  })

  it('reads the files, the format and the options', () => {
    expect(
      parseRenderArgs([
        ...app,
        '.',
        '--render',
        'docs/order.diagram.json',
        '--out',
        'out/Checkout.MP4',
        '--theme',
        'light',
        '--flow',
        'Checkout',
        '--max-size',
        '1920',
      ]),
    ).toEqual({
      input: path.resolve('docs/order.diagram.json'),
      output: path.resolve('out/Checkout.MP4'),
      format: 'mp4',
      theme: 'light',
      flow: 'Checkout',
      maxSizePx: 1920,
    })
    expect(parseRenderArgs([...app, '--render', 'a.json', '--out', 'a.png', '--flow', 'f_1', '--step', '0'])).toEqual({
      input: path.resolve('a.json'),
      output: path.resolve('a.png'),
      format: 'png',
      flow: 'f_1',
      step: 0,
    })
  })

  it.each([
    [['--render', 'a.json'], '--out is missing.'],
    [['--render', '--out', 'a.png'], '--render needs a value.'],
    [['--render', 'a.json', '--out', 'a.jpg'], '--out must end in .png, .svg, .gif, .mp4 or .webm.'],
    [['--render', 'a.json', '--out', 'a.png', '--theme', 'blue'], '--theme must be dark or light.'],
    [['--render', 'a.json', '--out', 'a.png', '--step', '1.5'], '--step must be a whole number from 0.'],
    [
      ['--render', 'a.json', '--out', 'a.png', '--max-size', '10'],
      '--max-size must be a whole number from 64 to 8192.',
    ],
    [['--render', 'a.json', '--out', 'a.png', '--scale', '2'], 'Unknown option --scale.'],
    [['--render', 'a.json', '--out', 'a.png', 'extra'], 'Unexpected argument "extra".'],
  ])('refuses %j', (args, message) => {
    expect(() => parseRenderArgs([...app, ...args])).toThrow(new RenderUsageError(message))
  })
})
