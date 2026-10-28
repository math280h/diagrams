import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import electronPath from 'electron'
import { DIAGRAM_VERSION } from '@/model/schema'
import { diagramFile, expect, test } from './fixtures'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function sampleDiagram(): string {
  const sample = JSON.parse(readFileSync(`src/persistence/formats/v${DIAGRAM_VERSION}.json`, 'utf8')) as {
    diagrams: { nodes: unknown[]; flows: unknown[] }[]
  }
  return JSON.stringify(sample.diagrams.find((diagram) => diagram.nodes.length > 0 && diagram.flows.length > 0))
}

function render(args: string[], env: Record<string, string>) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(electronPath as unknown as string, ['.', '--render', ...args], { env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.once('error', reject)
    child.once('exit', (code) => resolve({ code, stdout, stderr }))
  })
}

test('renders a diagram file as a PNG and an SVG image from the command line', async ({ dirs, appEnv }) => {
  const folder = path.dirname(dirs.data)
  const input = path.join(folder, 'orders.diagram.json')
  writeFileSync(input, sampleDiagram())

  const png = path.join(folder, 'orders.png')
  const pngRun = await render([input, '--out', png, '--max-size', '800'], appEnv)
  expect(pngRun.code, pngRun.stderr).toBe(0)
  expect(pngRun.stdout).toContain(`Wrote ${png}`)
  expect(readFileSync(png).subarray(0, 8)).toEqual(PNG_SIGNATURE)

  const svg = path.join(folder, 'orders.svg')
  const svgRun = await render([input, '--out', svg, '--theme', 'light'], appEnv)
  expect(svgRun.code, svgRun.stderr).toBe(0)
  expect(readFileSync(svg, 'utf8')).toContain('<svg')
})

test('explains a wrong command line, a missing flow and an empty diagram', async ({ dirs, appEnv }) => {
  const folder = path.dirname(dirs.data)
  const input = path.join(folder, 'orders.diagram.json')
  writeFileSync(input, sampleDiagram())

  const usage = await render([input, '--out', path.join(folder, 'orders.jpg')], appEnv)
  expect(usage.code).toBe(2)
  expect(usage.stderr).toContain('--out must end in .png, .svg, .gif, .mp4 or .webm.')
  expect(usage.stderr).toContain('Usage: Diagrams --render')

  const flow = await render([input, '--out', path.join(folder, 'orders.png'), '--flow', 'Checkout'], appEnv)
  expect(flow.code).toBe(1)
  expect(flow.stderr).toContain('The diagram has no flow "Checkout".')

  const empty = path.join(folder, 'empty.diagram.json')
  writeFileSync(empty, diagramFile('Empty', 'd_empty').text)
  const emptyRun = await render([empty, '--out', path.join(folder, 'empty.png')], appEnv)
  expect(emptyRun.code).toBe(1)
  expect(emptyRun.stderr).toContain('The diagram is empty, so there is nothing to render.')
})
