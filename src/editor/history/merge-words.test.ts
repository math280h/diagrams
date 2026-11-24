import { describe, expect, it } from 'vitest'
import type { Diagram } from '@/model/schema'
import { reviewOf } from '@/store/outside-review'
import { DiagramBuilder } from '@/templates/builder'
import { conflictElement, conflictElementKey, conflictRect, resultText, valueView } from './merge-words'

function edited(diagram: Diagram, recipe: (draft: Diagram) => void) {
  const copy = structuredClone(diagram)
  recipe(copy)
  return copy
}

const b = new DiagramBuilder()
const api = b.card(0, 0, { title: 'API' })
const db = b.card(400, 0, { title: 'Orders DB' })
const sql = b.edge(api, db, { label: 'SQL' })
const base = b.build('Shop')

function card(diagram: Diagram, id: string) {
  const found = diagram.nodes.find((node) => node.id === id)
  if (found?.type !== 'card') throw new Error(`${id} is not a card`)
  return found
}

describe('merge words', () => {
  it('describes each side of a title, a position and a colour', () => {
    const mine = edited(base, (draft) => {
      card(draft, api).data.title = 'Gateway'
      card(draft, api).position = { x: 40, y: 0 }
      card(draft, api).data.color = 'teal'
    })
    const theirs = edited(base, (draft) => {
      card(draft, api).data.title = 'Edge API'
      card(draft, api).position = { x: -20, y: 30 }
      card(draft, api).data.color = 'pink'
    })
    const review = reviewOf(base, mine, theirs)
    const [position, title, color] = review.result.conflicts
    expect(conflictElement(review, title!)).toBe('Gateway')
    expect(title!.label).toBe('Title')
    expect(valueView(title!, 'theirs')).toEqual({ kind: 'text', text: 'Edge API' })
    expect(valueView(position!, 'mine')).toEqual({ kind: 'text', text: 'Moved right' })
    expect(valueView(position!, 'theirs')).toEqual({ kind: 'text', text: 'Moved left and down' })
    expect(valueView(color!, 'mine')).toEqual({ kind: 'color', color: 'teal', text: 'Teal' })
    expect(resultText(review, title!)).toBe('Gateway')
    expect(conflictRect(review.theirs, title!)).toMatchObject({ x: -20, y: 30 })
    expect(conflictElementKey(title!)).toBe(`node:${api}`)
  })

  it('counts the items of a list and names the added ones', () => {
    const mine = edited(base, (draft) => void (card(draft, api).data.lines = [{ id: 'l_1', text: 'GET /orders' }]))
    const theirs = edited(base, (draft) => void (card(draft, api).data.lines = [{ id: 'l_2', text: 'POST /pay' }]))
    const [lines] = reviewOf(base, mine, theirs).result.conflicts
    expect(lines!.label).toBe('Lines')
    expect(valueView(lines!, 'mine')).toEqual({ kind: 'text', text: '1 item, adds “GET /orders”' })
  })

  it('names an edge by its nodes and says which side deleted it', () => {
    const mine = edited(base, (draft) => void (draft.edges = []))
    const theirs = edited(base, (draft) => void (draft.edges[0]!.data.label = 'Postgres'))
    const review = reviewOf(base, mine, theirs)
    const [conflict] = review.result.conflicts
    expect(conflict?.id).toBe(sql)
    expect(conflictElement(review, conflict!)).toBe('API → Orders DB')
    expect(valueView(conflict!, 'mine')).toEqual({ kind: 'text', text: 'Deleted' })
    expect(valueView(conflict!, 'theirs')).toEqual({ kind: 'text', text: 'Changed' })
    expect(conflictRect(review.mine, conflict!)).toBeNull()
    expect(conflictRect(review.theirs, conflict!)).toMatchObject({ x: 0, y: 0 })
  })

  it('names the diagram for a conflict of its name', () => {
    const review = reviewOf(
      base,
      edited(base, (draft) => void (draft.name = 'Store')),
      edited(base, (draft) => void (draft.name = '')),
    )
    const [conflict] = review.result.conflicts
    expect(conflictElement(review, conflict!)).toBe('Diagram')
    expect(conflict!.label).toBe('Diagram name')
    expect(valueView(conflict!, 'theirs')).toEqual({ kind: 'empty', text: 'Empty' })
    expect(conflictElementKey(conflict!)).toBeNull()
  })
})
