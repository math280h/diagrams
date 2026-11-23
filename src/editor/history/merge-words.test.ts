import { describe, expect, it } from 'vitest'
import type { Diagram } from '@/model/schema'
import { reviewOf } from '@/store/outside-review'
import { DiagramBuilder } from '@/templates/builder'
import { conflictDetail, conflictRect, conflictTitle } from './merge-words'

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

function retitled(title: string) {
  return (draft: Diagram) => {
    const found = draft.nodes.find((node) => node.id === api)
    if (found?.type === 'card') found.data.title = title
    found!.position = title === 'Gateway' ? { x: 0, y: 40 } : { x: 0, y: 80 }
  }
}

describe('merge words', () => {
  it('names a node conflict and the fields that both sides changed', () => {
    const review = reviewOf(base, edited(base, retitled('Gateway')), edited(base, retitled('Edge API')))
    const [conflict] = review.result.conflicts
    expect(conflictTitle(review, conflict!)).toBe('Gateway')
    expect(conflictDetail(review, conflict!, 'from disk')).toBe('Both sides changed the position and title.')
    expect(conflictRect(review, conflict!)).toMatchObject({ x: 0, y: 40 })
  })

  it('names an edge by its nodes and tells which side deleted it', () => {
    const mine = edited(base, (draft) => void (draft.edges = []))
    const theirs = edited(base, (draft) => void (draft.edges[0]!.data.label = 'Postgres'))
    const review = reviewOf(base, mine, theirs)
    const [conflict] = review.result.conflicts
    expect(conflict?.id).toBe(sql)
    expect(conflictTitle(review, conflict!)).toBe('API → Orders DB')
    expect(conflictDetail(review, conflict!, 'from disk')).toBe('Deleted here, and changed from disk.')
    expect(conflictRect(review, conflict!)).toMatchObject({ x: 0, y: 0 })
  })

  it('shows both names in a conflict of the diagram name', () => {
    const review = reviewOf(
      base,
      edited(base, (draft) => void (draft.name = 'Store')),
      edited(base, (draft) => void (draft.name = 'Market')),
    )
    const [conflict] = review.result.conflicts
    expect(conflictTitle(review, conflict!)).toBe('Diagram name')
    expect(conflictDetail(review, conflict!, 'from the other tab')).toBe('Here: “Store”. From the other tab: “Market”.')
    expect(conflictRect(review, conflict!)).toBeNull()
  })
})
