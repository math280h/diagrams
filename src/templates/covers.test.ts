import { describe, expect, it } from 'vitest'
import { diagramIconNames } from '@/export/html-export'
import { nodeName } from '@/model/labels'
import { TEMPLATES } from '.'

describe('template covers', () => {
  for (const template of TEMPLATES.filter((each) => each.cover)) {
    it(`shows only parts of ${template.name}, with a flow to play`, () => {
      const full = template.build()
      const cover = template.cover!()
      const names = new Set(full.nodes.map(nodeName))
      for (const node of cover.nodes) expect(names, nodeName(node)).toContain(nodeName(node))
      const icons = diagramIconNames(full)
      for (const icon of diagramIconNames(cover)) expect(icons, icon).toContain(icon)
      expect(cover.flows.length).toBeGreaterThan(0)
    })
  }
})
