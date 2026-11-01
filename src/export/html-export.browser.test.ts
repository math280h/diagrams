import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Diagram } from '@/model/schema'
import { PLAYER_FILES } from '@/standalone/files'
import type { PageIcons } from '@/standalone/page-data'
import { DiagramBuilder } from '@/templates/builder'
import { exportHtmlPage } from './html-export'

const PLAYER = {
  [PLAYER_FILES.script]: 'window.playerStarted = true',
  [PLAYER_FILES.style]: '.player{color:red}',
  [PLAYER_FILES.licenses]: 'Player package licences\n',
}

let missing: string | null

function diagram(): Diagram {
  const builder = new DiagramBuilder()
  builder.card(0, 0, { title: 'Go service', icon: 'logo:go' })
  builder.card(300, 0, { title: 'Anchor', icon: 'anchor' })
  builder.card(600, 0, { title: 'Database', icon: 'database' })
  builder.card(900, 0, { title: 'Unknown', icon: 'not-an-icon' })
  builder.card(1200, 0, { title: 'Unknown logo', icon: 'logo:not-a-logo' })
  return builder.build('Shop <page>')
}

async function page(source: Diagram) {
  const blob = await exportHtmlPage(source)
  const html = await blob.text()
  return { blob, html, document: new DOMParser().parseFromString(html, 'text/html') }
}

beforeEach(() => {
  missing = null
  const realFetch = window.fetch.bind(window)
  vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const player = Object.entries(PLAYER).find(([path]) => url.endsWith(`/${path}`))
    if (!player) return realFetch(input, init)
    if (player[0] === missing) return new Response('Not found', { status: 404 })
    return new Response(player[1])
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('exportHtmlPage', () => {
  it('makes one HTML page with the player, the diagram and the escaped name', async () => {
    const source = diagram()
    const { blob, html, document } = await page(source)
    expect(blob.type).toBe('text/html')
    expect(document.title).toBe('Shop <page>')
    expect(html).toContain('<script>window.playerStarted = true</script>')
    expect(html).toContain('<style>.player{color:red}</style>')
    expect(JSON.parse(document.getElementById('dg-diagram')!.textContent)).toEqual(source)
  })

  it('carries only the icons that the player does not bundle and that exist', async () => {
    const { document } = await page(diagram())
    const icons = JSON.parse(document.getElementById('dg-icons')!.textContent) as PageIcons
    expect(Object.keys(icons.lucide)).toEqual(['anchor'])
    expect(Array.isArray(icons.lucide.anchor!.node)).toBe(true)
    expect(icons.sets.map((set) => [set.source, set.entries.map((entry) => entry.id)])).toEqual([['logo', ['logo:go']]])
  })

  it('embeds the fonts of the diagram as data and adds their licences', async () => {
    const { document } = await page(diagram())
    const fontCss = document.querySelector('style')!.textContent
    expect(fontCss).toContain("font-family:'Host Grotesk Variable'")
    expect(fontCss).toMatch(/src:url\(data:font\/woff2;base64,[\w+/=]{1000,}\) format\('woff2'\)/)
    const licenses = document.getElementById('third-party-licenses')!.textContent
    expect(licenses.startsWith('Player package licences\n\n')).toBe(true)
    expect(licenses).toContain('Font: Host Grotesk Variable')
    expect(licenses).toContain('Font: Fragment Mono')
  })

  it('fails when a player file cannot be loaded', async () => {
    missing = PLAYER_FILES.style
    await expect(exportHtmlPage(diagram())).rejects.toThrow(
      'The player file standalone/player.css could not be loaded (404).',
    )
  })
})
