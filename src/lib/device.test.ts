import { describe, expect, it } from 'vitest'
import { deviceKind } from './device'

const CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0'
const SAFARI_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605'
const CHROME_LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
const CHROME_ANDROID_PHONE =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36'
const CHROME_ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const SAFARI_IPAD_OLD =
  'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1'

const mouse = { maxTouchPoints: 0, coarsePointer: false, windowOrientation: false }
const touchScreenWithTrackpad = { maxTouchPoints: 10, coarsePointer: false, windowOrientation: false }
const tablet = { maxTouchPoints: 5, coarsePointer: true, windowOrientation: true }
const androidWithMouse = { maxTouchPoints: 0, coarsePointer: false, windowOrientation: true }

describe('deviceKind', () => {
  it('finds computers, also with a touch screen', () => {
    expect(deviceKind({ userAgent: CHROME_WINDOWS, ...mouse })).toBe('computer')
    expect(deviceKind({ userAgent: CHROME_WINDOWS, ...tablet })).toBe('computer')
    expect(deviceKind({ userAgent: SAFARI_MAC, ...mouse })).toBe('computer')
    expect(deviceKind({ userAgent: SAFARI_MAC, ...touchScreenWithTrackpad })).toBe('computer')
    expect(deviceKind({ userAgent: CHROME_LINUX, ...mouse })).toBe('computer')
    expect(deviceKind({ userAgent: CHROME_LINUX, ...touchScreenWithTrackpad })).toBe('computer')
  })

  it('finds phones and tablets that name themselves', () => {
    expect(deviceKind({ userAgent: SAFARI_IPHONE, ...tablet })).toBe('phone')
    expect(deviceKind({ userAgent: CHROME_ANDROID_PHONE, ...tablet })).toBe('phone')
    expect(deviceKind({ userAgent: CHROME_ANDROID_TABLET, ...tablet })).toBe('tablet')
    expect(deviceKind({ userAgent: SAFARI_IPAD_OLD, ...tablet })).toBe('tablet')
  })

  it('finds tablets that send the user agent of a computer', () => {
    expect(deviceKind({ userAgent: SAFARI_MAC, ...tablet, windowOrientation: false })).toBe('tablet')
    expect(deviceKind({ userAgent: CHROME_LINUX, ...tablet })).toBe('tablet')
    expect(deviceKind({ userAgent: CHROME_LINUX, ...tablet, windowOrientation: false })).toBe('tablet')
  })

  it('counts an Android computer that sends the user agent of a Linux computer as a tablet', () => {
    expect(deviceKind({ userAgent: CHROME_LINUX, ...androidWithMouse })).toBe('tablet')
  })
})
