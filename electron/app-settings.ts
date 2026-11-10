import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type { AppSettings } from '@/desktop/contract'

export const APP_SETTINGS_FILE = 'app-settings.json'

export interface StoredSettings extends AppSettings {
  /** True after the app told the user once that it still runs without a window. */
  backgroundNoticeShown: boolean
}

const DEFAULT_SETTINGS: StoredSettings = { keepRunning: true, backgroundNoticeShown: false }

const STORED_SETTINGS = z
  .object({
    keepRunning: z.boolean().catch(DEFAULT_SETTINGS.keepRunning),
    backgroundNoticeShown: z.boolean().catch(DEFAULT_SETTINGS.backgroundNoticeShown),
  })
  .catch(DEFAULT_SETTINGS)

function readSettings(file: string): StoredSettings {
  try {
    return STORED_SETTINGS.parse(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return DEFAULT_SETTINGS
  }
}

function writeSettings(file: string, settings: StoredSettings) {
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(settings))
  } catch {
    return
  }
}

/**
 * Keeps the app settings of the main process in a JSON file. A missing or damaged file, or a missing value, gives the
 * default. A failed write keeps the change until the app quits.
 */
export function createAppSettings(file: string) {
  let settings = readSettings(file)
  return {
    get: (): StoredSettings => settings,
    update(change: Partial<StoredSettings>): StoredSettings {
      settings = { ...settings, ...change }
      writeSettings(file, settings)
      return settings
    },
  }
}

export function publicSettings({ keepRunning }: StoredSettings): AppSettings {
  return { keepRunning }
}
