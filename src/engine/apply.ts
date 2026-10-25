import type { FlowFrame } from './flow/evaluate'

type FlowState = 'active' | 'visited' | 'idle' | ''

function setState(element: Element, state: FlowState) {
  if (state === '') {
    if (element.hasAttribute('data-flow')) element.removeAttribute('data-flow')
  } else if (element.getAttribute('data-flow') !== state) {
    element.setAttribute('data-flow', state)
  }
}

function setOpacity(element: HTMLElement | SVGElement, value: number | undefined) {
  const next = value === undefined ? '' : String(value)
  if (element.style.opacity !== next) element.style.opacity = next
}

/**
 * Writes the flow state of a frame to the DOM of one canvas.
 *
 * @param frame - The frame to show. The value `null` removes all flow state.
 * @param spotlight - If true, the function marks elements that the flow did not reach as `idle`.
 */
export function applyFlowFrame(root: HTMLElement, frame: FlowFrame | null, spotlight: boolean) {
  for (const element of root.querySelectorAll<HTMLElement>('.react-flow__node')) {
    const id = element.dataset.id ?? ''
    let state: FlowState = ''
    if (frame) {
      if (frame.activeNodes.has(id)) state = 'active'
      else if (frame.visitedNodes.has(id)) state = 'visited'
      else if (spotlight && !element.classList.contains('react-flow__node-group')) state = 'idle'
    }
    setState(element, state)
    setOpacity(element, frame?.emphasis.get(`node:${id}`))
  }

  const edgeStates = new Map<string, FlowState>()
  for (const element of root.querySelectorAll<SVGElement>('.react-flow__edge')) {
    const id = element.dataset.id ?? ''
    let state: FlowState = ''
    if (frame) {
      if (frame.activeEdges.has(id)) state = 'active'
      else if (frame.visitedEdges.has(id)) state = 'visited'
      else if (spotlight) state = 'idle'
    }
    edgeStates.set(id, state)
    setState(element, state)
    setOpacity(element, frame?.emphasis.get(`edge:${id}`))
  }

  for (const element of root.querySelectorAll<HTMLElement>('[data-dg-edge]')) {
    const id = element.dataset.dgEdge ?? ''
    setState(element, edgeStates.get(id) ?? '')
    setOpacity(element, frame?.emphasis.get(`edge:${id}`))
  }
}
