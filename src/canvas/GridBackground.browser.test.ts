import { Background, BackgroundVariant, ReactFlowProvider, useStoreApi, type Transform } from '@xyflow/react'
import { act, createElement, Fragment, useEffect, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { GridBackground } from './GridBackground'

// React writes a warning for each act() call if IS_REACT_ACT_ENVIRONMENT is not true.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TRANSFORMS: Transform[] = [
  [137.5, -59.25, 1],
  [-311, 173, 0.37],
  [-311, 173, 0.37],
  [42, 18, 2.5],
  [0, 0, 0],
]

let root: Root | null = null
const setters: ((transform: Transform) => void)[] = []

function TransformControl() {
  const store = useStoreApi()
  useEffect(() => {
    const set = (transform: Transform) => store.setState({ transform })
    setters.push(set)
    return () => void setters.splice(setters.indexOf(set), 1)
  }, [store])
  return null
}

function markup(element: Element): string {
  const attributes = [...element.attributes].map((attribute) => `${attribute.name}="${attribute.value}"`).toSorted()
  return `<${element.tagName} ${attributes.join(' ')}>${[...element.children].map(markup).join('')}`
}

function inFlow(child: ReactElement) {
  return createElement(ReactFlowProvider, null, createElement(TransformControl), child)
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
})

describe('GridBackground', () => {
  it.each([
    [
      'dots',
      createElement(GridBackground, { variant: 'dots', gap: 16, size: 1.5, color: 'red' }),
      createElement(Background, { variant: BackgroundVariant.Dots, gap: 16, size: 1.5, color: 'red' }),
    ],
    [
      'lines',
      createElement(GridBackground, { variant: 'lines', gap: 16, lineWidth: 1, color: 'blue' }),
      createElement(Background, { variant: BackgroundVariant.Lines, gap: 16, lineWidth: 1, color: 'blue' }),
    ],
  ])('draws the same %s as the React Flow background for each viewport', (_name, own, library) => {
    root = createRoot(document.body.appendChild(document.createElement('div')))
    act(() => root!.render(createElement(Fragment, null, inFlow(own), inFlow(library))))
    const [ownSvg, librarySvg] = document.querySelectorAll('.react-flow__background')
    expect(markup(ownSvg!)).toBe(markup(librarySvg!))
    for (const transform of TRANSFORMS) {
      act(() => setters.forEach((set) => set(transform)))
      expect(markup(ownSvg!)).toBe(markup(librarySvg!))
    }
  })
})
