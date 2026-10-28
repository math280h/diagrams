import { COLORS, type Color } from '@/model/colors'
import { readingOrder } from '@/model/graph'
import { boundaryTitle, nodeLabel, nodeTitle } from '@/model/labels'
import type { EdgeData, ShapeKind } from '@/model/schema'
import type { DiagramEdge, DiagramNode } from '@/model/types'

const INDENT = '    '

const SHAPE_BRACKETS: Record<ShapeKind, readonly [string, string]> = {
  rectangle: ['[', ']'],
  rounded: ['(', ')'],
  pill: ['([', '])'],
  circle: ['((', '))'],
  diamond: ['{', '}'],
  hexagon: ['{{', '}}'],
  cylinder: ['[(', ')]'],
  parallelogram: ['[/', '/]'],
}

// Mermaid reads these words as syntax when they stand alone as a node id.
const RESERVED_IDS = new Set([
  'end',
  'graph',
  'flowchart',
  'subgraph',
  'direction',
  'style',
  'linkstyle',
  'class',
  'classdef',
  'click',
  'call',
  'callback',
  'href',
  'default',
  'interpolate',
])

// Mermaid ends a quoted label at a double quote, and reads < and > as the start of HTML.
const ENTITIES: Record<string, string> = { '"': '#quot;', '<': '#lt;', '>': '#gt;' }

const START_MARKERS: Record<EdgeData['markerStart'], string> = { none: '', arrow: '<', dot: 'o' }

/** The stroke that a Mermaid export gives to each palette colour. Each stroke shows on a light and on a dark page. */
export const MERMAID_STROKES: Readonly<Record<Exclude<Color, 'neutral'>, string>> = {
  orange: '#cf7229',
  yellow: '#b18c20',
  green: '#34a65c',
  teal: '#23a5a6',
  blue: '#5297b9',
  pink: '#cd659b',
  red: '#d86560',
}

function quoted(lines: readonly string[]): string {
  const text = lines
    .flatMap((line) => line.split('\n'))
    .map((line) => line.trim().replace(/["<>]/g, (char) => ENTITIES[char]!))
    .filter(Boolean)
    .join('<br/>')
  return `"${text}"`
}

function idMaker() {
  const used = new Set<string>()
  return (label: string) => {
    const slug = label
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32)
      .replace(/_+$/, '')
    const base = /^[a-z]/.test(slug) && !RESERVED_IDS.has(slug) ? slug : slug ? `node_${slug}` : 'node'
    let id = base
    for (let count = 2; used.has(id); count++) id = `${base}_${count}`
    used.add(id)
    return id
  }
}

function fullLabel(node: DiagramNode): string {
  return nodeLabel(node).trim() ? nodeLabel(node) : nodeTitle(node)
}

function cardLines(node: Extract<DiagramNode, { type: 'card' }>): string[] {
  return [fullLabel(node), ...node.data.lines.map((line) => line.text.replace(/\{([^{}]*)\}/g, '$1'))]
}

function groupTitle(node: Extract<DiagramNode, { type: 'group' }>): string[] {
  return [boundaryTitle(node), node.data.detail]
}

function nodeShape(node: Exclude<DiagramNode, { type: 'group' | 'text' }>): string {
  if (node.type === 'shape') {
    const [open, close] = SHAPE_BRACKETS[node.data.shape]
    return `${open}${quoted([fullLabel(node)])}${close}`
  }
  const [open, close] = SHAPE_BRACKETS[node.data.form === 'datastore' ? 'cylinder' : 'rectangle']
  return `${open}${quoted(cardLines(node))}${close}`
}

function exportedColor(node: DiagramNode): Color | null {
  if (node.type === 'text') return null
  const color = node.data.color
  return color === 'neutral' || color === 'auto' ? null : color
}

type Marker = EdgeData['markerEnd']

function markers(data: EdgeData | undefined): { swapped: boolean; start: Marker; end: Marker } {
  const start = data?.markerStart ?? 'none'
  const end = data?.markerEnd ?? 'arrow'
  if (end === 'none') return { swapped: start !== 'none', start: 'none', end: start }
  // Mermaid reads a link with two different end markers as not valid.
  return { swapped: false, start: start === end ? start : 'none', end }
}

function link(data: EdgeData | undefined, start: Marker, end: Marker): string {
  const dotted = data !== undefined && data.stroke !== 'solid'
  const thick = !dotted && data !== undefined && data.width >= 2
  const head = START_MARKERS[start]
  if (dotted) return `${head}-.${end === 'arrow' ? '->' : end === 'dot' ? '-o' : '-'}`
  if (thick) return `${head}==${end === 'arrow' ? '>' : end === 'dot' ? 'o' : '='}`
  return `${head}--${end === 'arrow' ? '>' : end === 'dot' ? 'o' : '-'}`
}

/**
 * Writes the nodes and edges of a diagram as a Mermaid flowchart.
 *
 * Cards, shapes and boundaries become nodes and nested subgraphs, and their colours become classes. Text nodes, flows,
 * icons and positions stay out, and Mermaid lays out the chart again. The direction follows the edges: `LR` unless
 * they run mostly down. A boundary with the colour of its kind gets no class.
 */
export function diagramToMermaid(content: { nodes: readonly DiagramNode[]; edges: readonly DiagramEdge[] }): string {
  const byId = new Map(content.nodes.map((node) => [node.id, node]))
  const kept = content.nodes.filter((node) => node.type !== 'text')
  const keptIds = new Set(kept.map((node) => node.id))
  const edges = content.edges.filter((edge) => keptIds.has(edge.source) && keptIds.has(edge.target))
  const { direction, nodes: ordered } = readingOrder(kept, edges, byId)
  const rank = new Map(ordered.map((node, index) => [node.id, index]))

  const nextId = idMaker()
  const ids = new Map(ordered.map((node) => [node.id, nextId(nodeTitle(node))]))
  const children = new Map<string | undefined, DiagramNode[]>()
  for (const node of ordered) {
    const parent = node.parentId !== undefined && keptIds.has(node.parentId) ? node.parentId : undefined
    children.set(parent, [...(children.get(parent) ?? []), node])
  }

  const lines = [`flowchart ${direction}`]
  const write = (parent: string | undefined, depth: number) => {
    const indent = INDENT.repeat(depth)
    for (const node of children.get(parent) ?? []) {
      const id = ids.get(node.id)!
      if (node.type === 'group') {
        lines.push(`${indent}subgraph ${id}[${quoted(groupTitle(node))}]`)
        write(node.id, depth + 1)
        lines.push(`${indent}end`)
      } else if (node.type !== 'text') {
        lines.push(`${indent}${id}${nodeShape(node)}`)
      }
    }
  }
  write(undefined, 1)

  const links = edges.map((edge) => {
    const { swapped, start, end } = markers(edge.data)
    const [from, to] = swapped ? [edge.target, edge.source] : [edge.source, edge.target]
    return { from, to, data: edge.data, start, end }
  })
  links.sort((a, b) => rank.get(a.from)! - rank.get(b.from)! || rank.get(a.to)! - rank.get(b.to)!)
  for (const { from, to, data, start, end } of links) {
    const label = data?.label.trim() ? `|${quoted([data.label])}|` : ''
    lines.push(`${INDENT}${ids.get(from)} ${link(data, start, end)}${label} ${ids.get(to)}`)
  }
  for (const color of COLORS) {
    const members = ordered.filter((node) => exportedColor(node) === color).map((node) => ids.get(node.id)!)
    if (color === 'neutral' || members.length === 0) continue
    lines.push(`${INDENT}classDef ${color} stroke:${MERMAID_STROKES[color]},stroke-width:2px`)
    lines.push(`${INDENT}class ${members.join(',')} ${color}`)
  }
  return `${lines.join('\n')}\n`
}
