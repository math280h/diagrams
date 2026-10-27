import { describe, expect, it } from 'vitest'
import { TEMPLATES } from '@/templates'
import { diagramIconNames } from './html-export'

describe('diagramIconNames', () => {
  it('lists the icons of the cards, shapes, boundaries and flow tokens', () => {
    const diagram = TEMPLATES.find((template) => template.id === 'order-system')!.build()
    const names = diagramIconNames(diagram)
    expect(names).toEqual(
      new Set([
        'aws:vpc-group',
        'monitor',
        'logo:envoyproxy',
        'shield-check',
        'logo:go',
        'logo:postgresql',
        'logo:redis',
        'logo:apachekafka',
        'logo:nodedotjs',
        'logo:stripe',
      ]),
    )
  })
})
