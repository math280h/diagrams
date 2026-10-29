import { describe, expect, it } from 'vitest'
import { isDesktopComputer } from './open-in-app'

const CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0'
const SAFARI_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605'
const CHROME_LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0'
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

const mouse = { maxTouchPoints: 0, coarsePointer: false }
const touchScreenWithTrackpad = { maxTouchPoints: 10, coarsePointer: false }
const finger = { maxTouchPoints: 5, coarsePointer: true }

describe('isDesktopComputer', () => {
  it('accepts computers, also with a touch screen', () => {
    expect(isDesktopComputer({ userAgent: CHROME_WINDOWS, ...mouse })).toBe(true)
    expect(isDesktopComputer({ userAgent: CHROME_WINDOWS, ...finger })).toBe(true)
    expect(isDesktopComputer({ userAgent: SAFARI_MAC, ...mouse })).toBe(true)
    expect(isDesktopComputer({ userAgent: CHROME_LINUX, ...mouse })).toBe(true)
    expect(isDesktopComputer({ userAgent: CHROME_LINUX, ...touchScreenWithTrackpad })).toBe(true)
  })

  it('refuses phones and tablets that name themselves', () => {
    expect(isDesktopComputer({ userAgent: SAFARI_IPHONE, ...finger })).toBe(false)
    expect(isDesktopComputer({ userAgent: CHROME_ANDROID, ...finger })).toBe(false)
  })

  it('refuses tablets that send the user agent of a computer', () => {
    expect(isDesktopComputer({ userAgent: SAFARI_MAC, ...finger })).toBe(false)
    expect(isDesktopComputer({ userAgent: SAFARI_MAC, maxTouchPoints: 5, coarsePointer: false })).toBe(false)
    expect(isDesktopComputer({ userAgent: CHROME_LINUX, ...finger })).toBe(false)
  })
})
