import { describe, expect, it } from 'vitest'
import { installerUrl, systemFor } from './download'

const CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0'
const SAFARI_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605'
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0'
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0'

const RELEASE = 'https://github.com/math280h/diagrams/releases/download/v0.2.0/'
const ASSETS = [
  'Diagrams-0.2.0-win-x64.exe',
  'Diagrams-0.2.0-win-x64.exe.blockmap',
  'Diagrams-0.2.0-mac-arm64.dmg',
  'Diagrams-0.2.0-mac-arm64.zip',
  'Diagrams-0.2.0-mac-x64.dmg',
  'Diagrams-0.2.0-linux-x86_64.AppImage',
  'Diagrams-0.2.0-linux-amd64.deb',
  'latest.yml',
].map((name) => ({ name, browser_download_url: `${RELEASE}${name}` }))

describe('systemFor', () => {
  it('reads the client hints of Chromium browsers', () => {
    expect(systemFor({ platform: 'Windows', architecture: 'x86', userAgent: CHROME_WINDOWS })).toBe('windows')
    expect(systemFor({ platform: 'Windows', architecture: 'arm', userAgent: CHROME_WINDOWS })).toBe('windows')
    expect(systemFor({ platform: 'macOS', architecture: 'arm', userAgent: SAFARI_MAC })).toBe('mac-arm64')
    expect(systemFor({ platform: 'macOS', architecture: 'x86', userAgent: SAFARI_MAC })).toBe('mac-x64')
    expect(systemFor({ platform: 'Linux', architecture: 'x86', userAgent: FIREFOX_LINUX })).toBe('linux')
  })

  it('falls back to the user agent without client hints', () => {
    expect(systemFor({ platform: '', architecture: null, userAgent: CHROME_WINDOWS })).toBe('windows')
    expect(systemFor({ platform: '', architecture: null, userAgent: FIREFOX_LINUX })).toBe('linux')
  })

  it('returns no build when it cannot pick the right one', () => {
    expect(systemFor({ platform: '', architecture: null, userAgent: SAFARI_MAC })).toBeNull()
    expect(systemFor({ platform: 'Linux', architecture: 'arm', userAgent: FIREFOX_LINUX })).toBeNull()
    expect(systemFor({ platform: '', architecture: null, userAgent: CHROME_ANDROID })).toBeNull()
    expect(systemFor({ platform: 'Android', architecture: 'arm', userAgent: CHROME_ANDROID })).toBeNull()
  })
})

describe('installerUrl', () => {
  it('picks the installer of the system', () => {
    expect(installerUrl(ASSETS, 'windows')).toBe(`${RELEASE}Diagrams-0.2.0-win-x64.exe`)
    expect(installerUrl(ASSETS, 'mac-arm64')).toBe(`${RELEASE}Diagrams-0.2.0-mac-arm64.dmg`)
    expect(installerUrl(ASSETS, 'mac-x64')).toBe(`${RELEASE}Diagrams-0.2.0-mac-x64.dmg`)
    expect(installerUrl(ASSETS, 'linux')).toBe(`${RELEASE}Diagrams-0.2.0-linux-x86_64.AppImage`)
  })

  it('accepts only downloads from the releases of this repository', () => {
    const elsewhere = [
      { name: 'Diagrams-0.2.0-win-x64.exe', browser_download_url: 'https://example.com/a-win-x64.exe' },
    ]
    expect(installerUrl(elsewhere, 'windows')).toBeNull()
    expect(installerUrl([], 'windows')).toBeNull()
  })
})
