import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { diagramSchema } from '@/model/schema'
import yLink from './samples/y-checkout-flow.txt?raw'
import zLink from './samples/z-checkout-flow.txt?raw'
import { decodeShareData, ShareLinkError } from './share-link'

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('')
const SLOW = { timeout: 120_000 }

async function expectDiagramOrLinkError(data: string): Promise<void> {
  let diagram: unknown
  try {
    diagram = await decodeShareData(data)
  } catch (error) {
    expect(error).toBeInstanceOf(ShareLinkError)
    return
  }
  expect(diagramSchema.safeParse(diagram).success).toBe(true)
}

function editedLink(link: string): fc.Arbitrary<string> {
  const edit = fc.record({
    at: fc.nat({ max: link.length - 1 }),
    remove: fc.nat({ max: 3 }),
    insert: fc.array(fc.constantFrom(...BASE64URL), { maxLength: 3 }).map((characters) => characters.join('')),
  })
  return fc
    .array(edit, { minLength: 1, maxLength: 4 })
    .map((edits) =>
      edits.reduce((text, { at, remove, insert }) => text.slice(0, at) + insert + text.slice(at + remove), link),
    )
}

describe('share link input', () => {
  it('reads any share data as a diagram or rejects it with a link error', SLOW, async () => {
    const body = fc.array(fc.constantFrom(...BASE64URL), { maxLength: 200 }).map((characters) => characters.join(''))
    const data = fc.oneof(
      fc.string(),
      body.map((text) => `y${text}x`),
      body.map((text) => `z${text}`),
    )
    await fc.assert(fc.asyncProperty(data, expectDiagramOrLinkError))
  })

  it('reads a changed share link as a diagram or rejects it with a link error', SLOW, async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(editedLink(yLink.trim()), editedLink(zLink.trim())), expectDiagramOrLinkError),
      {
        numRuns: 60,
      },
    )
  })
})
