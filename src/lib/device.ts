/**
 * The kind of device that a browser runs on. A `computer` runs the desktop app. A `tablet` is a tablet or an Android
 * computer, such as Samsung DeX, which runs the same apps as a tablet.
 */
export type DeviceKind = 'computer' | 'tablet' | 'phone'

export interface BrowserDevice {
  userAgent: string
  maxTouchPoints: number
  /** True if the primary pointer is a finger, as the `(pointer: coarse)` media query tells. */
  coarsePointer: boolean
  /** True if the browser has `window.orientation`. */
  windowOrientation: boolean
}

/** Returns the kind of device that a browser with these properties runs on. */
export function deviceKind({ userAgent, maxTouchPoints, coarsePointer, windowOrientation }: BrowserDevice): DeviceKind {
  if (/iPad/i.test(userAgent)) return 'tablet'
  if (/iPhone|iPod/i.test(userAgent)) return 'phone'
  if (/Android/i.test(userAgent)) return /Mobile/i.test(userAgent) ? 'phone' : 'tablet'
  if (/Mobile/i.test(userAgent)) return 'phone'
  const fingerFirst = maxTouchPoints > 0 && coarsePointer
  // iPadOS Safari sends the user agent of a Mac.
  if (/Macintosh/.test(userAgent)) return fingerFirst ? 'tablet' : 'computer'
  // Chrome on large tablets and on Android computers sends the user agent of a Linux computer.
  // Of the browsers with a Linux user agent, only the Android browsers have window.orientation.
  if (/Linux/.test(userAgent)) return fingerFirst || windowOrientation ? 'tablet' : 'computer'
  return 'computer'
}

/** Returns the kind of device of this browser, or `null` outside a browser. */
export function browserDeviceKind(): DeviceKind | null {
  if (typeof window === 'undefined') return null
  return deviceKind({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    windowOrientation: 'orientation' in window,
  })
}
