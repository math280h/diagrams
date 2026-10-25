import { useEffect, useState } from 'react'
import { DESKTOP_DOWNLOAD_URL, LATEST_RELEASE_API_URL, RELEASE_ASSET_URL_PREFIX } from './constants'

const LOOKUP_TIMEOUT_MS = 5000

export type DesktopSystem = 'windows' | 'mac-arm64' | 'mac-x64' | 'linux'

export const SYSTEM_NAMES: Record<DesktopSystem, string> = {
  windows: 'Windows',
  'mac-arm64': 'macOS',
  'mac-x64': 'macOS',
  linux: 'Linux',
}

const INSTALLER_NAMES: Record<DesktopSystem, RegExp> = {
  windows: /-win-x64\.exe$/,
  'mac-arm64': /-mac-arm64\.dmg$/,
  'mac-x64': /-mac-x64\.dmg$/,
  linux: /-linux-x86_64\.AppImage$/,
}

interface BrowserSystem {
  /** The platform from the user agent client hints, or an empty string. */
  platform: string
  /** The CPU architecture from the client hints (`x86` or `arm`), or `null` if the browser does not tell it. */
  architecture: string | null
  userAgent: string
}

interface ReleaseAsset {
  name: string
  browser_download_url: string
}

export interface DesktopDownload {
  url: string
  /** The system of the installer at {@link DesktopDownload.url}, or `null` for the release page. */
  system: DesktopSystem | null
}

function platformFromUserAgent(userAgent: string): string {
  if (/Android|CrOS|iPhone|iPad/.test(userAgent)) return ''
  if (/Windows NT/.test(userAgent)) return 'Windows'
  if (/Macintosh|Mac OS X/.test(userAgent)) return 'macOS'
  if (/Linux/.test(userAgent)) return 'Linux'
  return ''
}

/**
 * Returns the desktop build for a browser, or `null` if no build fits or the browser does not tell enough. A Mac
 * without the architecture hint returns `null`. Safari and Firefox report an Intel Mac also on Apple silicon.
 */
export function systemFor({ platform, architecture, userAgent }: BrowserSystem): DesktopSystem | null {
  const name = platform || platformFromUserAgent(userAgent)
  if (name === 'Windows') return 'windows'
  if (name === 'macOS') return architecture === 'arm' ? 'mac-arm64' : architecture === 'x86' ? 'mac-x64' : null
  if (name === 'Linux') return architecture === 'arm' ? null : 'linux'
  return null
}

/** Returns the download URL of the installer for the system in the release assets, or `null`. */
export function installerUrl(assets: readonly ReleaseAsset[], system: DesktopSystem): string | null {
  const asset = assets.find((candidate) => INSTALLER_NAMES[system].test(candidate.name))
  return asset?.browser_download_url.startsWith(RELEASE_ASSET_URL_PREFIX) ? asset.browser_download_url : null
}

async function browserSystem(): Promise<BrowserSystem> {
  const hints = (
    navigator as Navigator & {
      userAgentData?: { platform: string; getHighEntropyValues(keys: string[]): Promise<{ architecture?: string }> }
    }
  ).userAgentData
  let architecture: string | null = null
  try {
    architecture = (await hints?.getHighEntropyValues(['architecture']))?.architecture || null
  } catch {
    architecture = null
  }
  return { platform: hints?.platform ?? '', architecture, userAgent: navigator.userAgent }
}

async function lookUpDownload(): Promise<DesktopDownload> {
  const fallback: DesktopDownload = { url: DESKTOP_DOWNLOAD_URL, system: null }
  try {
    const system = systemFor(await browserSystem())
    if (!system) return fallback
    const response = await fetch(LATEST_RELEASE_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    })
    if (!response.ok) return fallback
    const release = (await response.json()) as { assets?: ReleaseAsset[] }
    const url = installerUrl(release.assets ?? [], system)
    return url ? { url, system } : fallback
  } catch {
    return fallback
  }
}

let lookup: Promise<DesktopDownload> | null = null

/**
 * Returns the installer of the latest release for the system of this browser. Until the lookup ends, and when it
 * fails, the result is the release page.
 */
export function useDesktopDownload(): DesktopDownload {
  const [download, setDownload] = useState<DesktopDownload>({ url: DESKTOP_DOWNLOAD_URL, system: null })
  useEffect(() => {
    let active = true
    lookup ??= lookUpDownload()
    void lookup.then((found) => {
      if (active) setDownload(found)
    })
    return () => {
      active = false
    }
  }, [])
  return download
}
