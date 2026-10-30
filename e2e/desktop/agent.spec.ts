import { AGENT_ENDPOINT } from '@/desktop/constants'
import { agentUrl, callTool, expect, test } from './fixtures'

const PNG_SIGNATURE = 'iVBORw0KGgo'
// React Flow hides a node until it measures the node.
const MEASURE_TIMEOUT_MS = 20_000

test('refuses a client without the token', async ({ window, agentPort }) => {
  await expect(window.getByRole('banner').getByRole('button', { name: 'Connect an agent' })).toBeVisible()
  const response = await fetch(`${agentUrl(agentPort)}${AGENT_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  })
  expect(response.status).toBe(401)
})

test('an agent builds a diagram that the user sees and undoes in one step', async ({ window, mcp }) => {
  await callTool(mcp, 'create_diagram', { name: 'Made by an agent' })
  await expect(window.getByLabel('Diagram name')).toHaveValue('Made by an agent')

  await callTool(mcp, 'add_elements', {
    nodes: [
      { ref: 'vpc', kind: 'group', label: 'shop', boundary: 'aws.vpc' },
      { ref: 'api', label: 'Checkout API', icon: 'aws:lambda', parent: 'vpc' },
      { ref: 'db', label: 'Orders DB', icon: 'logo:postgresql', parent: 'vpc' },
      { ref: 'user', label: 'Shopper', form: 'client', icon: 'monitor' },
    ],
    edges: [
      { from: 'user', to: 'api', label: 'HTTPS' },
      { from: 'api', to: 'db', label: 'SQL' },
    ],
  })
  const nodes = window.locator('[data-editor-canvas] .react-flow__node')
  await expect(nodes).toHaveCount(4)
  await expect(nodes.filter({ hasText: 'Checkout API' })).toBeVisible({ timeout: MEASURE_TIMEOUT_MS })

  await callTool(mcp, 'layout_diagram', {})
  const { json } = await callTool(mcp, 'get_diagram', {})
  expect(json.nodes).toHaveLength(4)

  await window.getByRole('button', { name: 'Version history' }).click()
  const versions = window.getByRole('listbox', { name: 'Versions' }).getByRole('option')
  await expect(versions.nth(1)).toContainText('Agent: Lay out diagram')
  await expect(versions.nth(2)).toContainText('Agent: Add nodes and edges')
  await expect(versions.nth(2)).toContainText('Added 4 nodes and 2 connections.')
  await window.getByRole('button', { name: 'Close version history' }).click()

  await window.getByRole('button', { name: 'Undo' }).click()
  await expect(nodes).toHaveCount(4)
  await window.getByRole('button', { name: 'Undo' }).click()
  await expect(nodes).toHaveCount(0)
})

test('an agent arranges a hub around the node that it names', async ({ window, mcp }) => {
  await callTool(mcp, 'create_diagram', { name: 'Event hub' })
  const services = ['Orders', 'Billing', 'Search', 'Mail', 'Stock', 'Reports']
  await callTool(mcp, 'add_elements', {
    nodes: [{ ref: 'bus', label: 'Event bus' }, ...services.map((label) => ({ ref: label, label }))],
    edges: services.map((label) => ({ from: label, to: 'bus' })),
  })
  await expect(window.locator('[data-editor-canvas] .react-flow__node')).toHaveCount(services.length + 1)

  await callTool(mcp, 'layout_diagram', { layout: 'hub', center: 'Event bus' })
  const { json } = await callTool(mcp, 'get_diagram', {})
  const nodes = json.nodes as { label: string; x: number; y: number; w: number; h: number }[]
  const centre = (node: (typeof nodes)[number]) => ({ x: node.x + node.w / 2, y: node.y + node.h / 2 })
  const bus = centre(nodes.find((node) => node.label === 'Event bus')!)
  const spokes = nodes.filter((node) => node.label !== 'Event bus').map(centre)
  expect(bus.x).toBeGreaterThan(Math.min(...spokes.map((point) => point.x)))
  expect(bus.x).toBeLessThan(Math.max(...spokes.map((point) => point.x)))
  expect(bus.y).toBeGreaterThan(Math.min(...spokes.map((point) => point.y)))
  expect(bus.y).toBeLessThan(Math.max(...spokes.map((point) => point.y)))
  const lint = await callTool(mcp, 'lint_diagram', {})
  const issues = lint.json.issues as { rule: string }[]
  expect(issues.filter((issue) => issue.rule === 'overlap')).toEqual([])
})

test.describe('with a native window', () => {
  test.use({ hideWindow: 'native' })

  test('renders a PNG, also while the window is minimized', async ({ app, window, mcp }) => {
    await callTool(mcp, 'create_diagram', { name: 'Rendered', template: 'order-system' })
    await expect(window.locator('[data-editor-canvas] .react-flow__node').first()).toBeVisible()

    const first = await callTool(mcp, 'render_image', { maxSizePx: 800 })
    const image = first.content.find((block) => block.type === 'image')
    expect(image?.data?.startsWith(PNG_SIGNATURE)).toBe(true)
    expect(first.json.width).toBe(800)

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.minimize())
    const second = await callTool(mcp, 'render_image', { flow: 'Place an order', step: 2, maxSizePx: 640 })
    expect(second.content.find((block) => block.type === 'image')?.data?.startsWith(PNG_SIGNATURE)).toBe(true)
  })
})
