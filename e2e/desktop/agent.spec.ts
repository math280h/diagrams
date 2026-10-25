import { AGENT_ENDPOINT } from '@/desktop/constants'
import { agentUrl, callTool, expect, test } from './fixtures'

const PNG_SIGNATURE = 'iVBORw0KGgo'

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
  await expect(window.getByText('Checkout API')).toBeVisible()

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
