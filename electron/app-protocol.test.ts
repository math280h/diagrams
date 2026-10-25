import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { originOf, resolveAppFile } from './app-protocol'

describe('app protocol', () => {
  it('gives the app scheme an origin', () => {
    expect(originOf('app://diagrams/index.html#/d/x')).toBe('app://diagrams')
    expect(originOf('http://127.0.0.1:5173/')).toBe('http://127.0.0.1:5173')
    expect(originOf('not a url')).toBe('')
  })

  it('serves files inside the renderer folder only', () => {
    const root = path.resolve('dist')
    expect(resolveAppFile('app://diagrams/', root)).toBe(path.join(root, 'index.html'))
    expect(resolveAppFile('app://diagrams/assets/a.js', root)).toBe(path.join(root, 'assets', 'a.js'))
    expect(resolveAppFile('app://diagrams/../secret.txt', root)).toBe(path.join(root, 'secret.txt'))
    expect(resolveAppFile('app://diagrams/%2e%2e%2fsecret.txt', root)).toBeNull()
    expect(resolveAppFile('app://other/index.html', root)).toBeNull()
  })
})
