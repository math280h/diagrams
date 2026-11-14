import { describe, expect, it } from 'vitest'
import { browserName, operatingSystem, pageKind } from './context'

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
const EDGE = `${CHROME_WINDOWS} Edg/142.0.0.0`
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0'
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Safari/605.1.15'
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Mobile/15E148 Safari/604.1'
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36'

describe('pageKind', () => {
  it('names the page without the id of the diagram or the data of a link', () => {
    expect(pageKind('')).toBe('library')
    expect(pageKind('#/')).toBe('library')
    expect(pageKind('#/d/d_vpdoc8peen')).toBe('editor')
    expect(pageKind('#/p/d_vpdoc8peen?step=2')).toBe('player')
    expect(pageKind('#/s/N4IgLgnhA')).toBe('shared link')
    expect(pageKind('#/releases')).toBe('releases')
    expect(pageKind('#/unknown/page')).toBe('other')
  })
})

describe('browserName', () => {
  it('names the browser and its major version', () => {
    expect(browserName(CHROME_WINDOWS)).toBe('Chrome 142')
    expect(browserName(EDGE)).toBe('Edge 142')
    expect(browserName(FIREFOX_LINUX)).toBe('Firefox 145')
    expect(browserName(SAFARI_MAC)).toBe('Safari 19')
    expect(browserName(SAFARI_IPHONE)).toBe('Safari 19')
    expect(browserName('curl/8.0')).toBe('Other browser')
  })
})

describe('operatingSystem', () => {
  it('names the operating system', () => {
    expect(operatingSystem(CHROME_WINDOWS)).toBe('windows')
    expect(operatingSystem(FIREFOX_LINUX)).toBe('linux')
    expect(operatingSystem(SAFARI_MAC)).toBe('macos')
    expect(operatingSystem(SAFARI_IPHONE)).toBe('ios')
    expect(operatingSystem(CHROME_ANDROID)).toBe('android')
    expect(operatingSystem('curl/8.0')).toBe('other')
  })
})
