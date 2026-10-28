/** Marks nodes and edges on the editor canvas. An empty list removes the marks. */
export function markOnCanvas(targets: readonly { kind: 'node' | 'edge'; id: string }[]) {
  const root = document.querySelector('[data-editor-canvas]')
  if (!root) return
  for (const element of root.querySelectorAll('[data-hover]')) element.removeAttribute('data-hover')
  for (const target of targets) {
    const selector = target.kind === 'node' ? '.react-flow__node' : '.react-flow__edge'
    root.querySelector(`${selector}[data-id="${CSS.escape(target.id)}"]`)?.setAttribute('data-hover', 'true')
  }
}
