import { describe, expect, it } from 'vitest'
import { diagramTexts } from './diagram-texts'

describe('diagramTexts', () => {
  it('collects the texts that a user wrote, and skips ids, icons and fixed values', () => {
    const diagram = {
      name: 'Payment plan',
      nodes: [
        {
          id: 'n_abcdefgh',
          data: {
            title: 'Billing API',
            icon: 'aws/lambda',
            lines: [{ id: 'l1', text: 'POST /charge' }],
            links: [{ id: 'k1', label: 'Runbook', url: 'https://wiki.example/billing' }],
            badge: 'beta',
          },
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'n_abcdefgh',
          data: {
            label: 'HTTPS',
            path: 'smooth',
            payload: { fields: [{ id: 'f1', path: 'customer.email', example: 'ana@example.com', description: '' }] },
          },
        },
      ],
      flows: [{ id: 'f', name: 'Checkout', steps: [{ id: 's', caption: 'The user pays', event: 'POST /pay' }] }],
    }
    expect(diagramTexts(diagram).toSorted()).toEqual(
      [
        'Payment plan',
        'Billing API',
        'POST /charge',
        'Runbook',
        'https://wiki.example/billing',
        'beta',
        'HTTPS',
        'customer.email',
        'ana@example.com',
        'Checkout',
        'The user pays',
        'POST /pay',
      ].toSorted(),
    )
  })

  it('returns nothing for values that are not objects', () => {
    expect(diagramTexts(null)).toEqual([])
    expect(diagramTexts('text')).toEqual([])
  })
})
