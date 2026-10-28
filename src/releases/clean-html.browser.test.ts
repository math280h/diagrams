import { describe, expect, it } from 'vitest'
import { cleanReleaseHtml } from './clean-html'

function html(source: string): string {
  const container = document.createElement('div')
  container.append(cleanReleaseHtml(source))
  return container.innerHTML
}

describe('cleanReleaseHtml', () => {
  it('keeps headings, lists, code and safe links, and opens links in a new tab', () => {
    expect(
      html(
        '<h2 dir="auto">What\'s Changed</h2><ul><li>Play a <code>trace</code> by <a class="user-mention" href="https://github.com/math280h">@math280h</a> in <a href="/math280h/diagrams/pull/14">#14</a></li></ul>',
      ),
    ).toBe(
      '<h2>What\'s Changed</h2><ul><li>Play a <code>trace</code> by <a href="https://github.com/math280h" target="_blank" rel="noopener noreferrer">@math280h</a> in <a href="https://github.com/math280h/diagrams/pull/14" target="_blank" rel="noopener noreferrer">#14</a></li></ul>',
    )
  })

  it('drops scripts, styles, frames, SVG, event handlers and script links', () => {
    expect(
      html(
        '<p onclick="alert(1)" style="color:red">Hi<script>alert(2)</script><style>p{}</style></p><iframe src="https://x.dev"></iframe><svg><a href="javascript:alert(3)">x</a></svg><a href="javascript:alert(4)">bad</a><img src=x onerror="alert(5)"><div><span>kept text</span></div>',
      ),
    ).toBe('<p>Hi</p><a>bad</a>kept text')
  })
})
