import { app } from 'electron'
import type { AppAbout } from '@/desktop/contract'

const SYSTEM_NAMES: Partial<Record<NodeJS.Platform, string>> = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }

export function appAbout(): AppAbout {
  const name = SYSTEM_NAMES[process.platform] ?? process.platform
  return { version: app.getVersion(), system: `${name} ${process.getSystemVersion()} (${process.arch})` }
}
