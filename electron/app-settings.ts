import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { repositoryName, websiteOrigin } from '@/desktop/build-config'
import { AGENT_WINDOW_MODES, type AgentWindowMode, type AppSettings, type OpenAtLogin } from '@/desktop/contract'

export const APP_SETTINGS_FILE = 'app-settings.json'

export interface StoredSettings {
  keepRunning: boolean
  /** True after the app told the user once that it still runs without a window. */
  backgroundNoticeShown: boolean
  /** True after the app adds itself one time to the programs that start at sign-in. After that, only the user changes it. */
  openAtLoginAdded: boolean
  agentWindow: AgentWindowMode
  /** The website origins that may send diagrams to the app. */
  websites: string[]
  /** The origin of the website for share links, or `null` for the first website. */
  shareWebsite: string | null
  /** The website of each build that added it to `websites` once. The app does not add a removed website again. */
  addedBuildWebsites: string[]
  /** The repository of updates that the user chose, or `null` for the repository of the build. */
  updateRepository: string | null
}

const DEFAULT_SETTINGS: StoredSettings = {
  keepRunning: true,
  backgroundNoticeShown: false,
  openAtLoginAdded: false,
  agentWindow: 'show',
  websites: [],
  shareWebsite: null,
  addedBuildWebsites: [],
  updateRepository: null,
}

function originOrNull(value: unknown): string | null {
  return typeof value === 'string' ? websiteOrigin(value) : null
}

const ORIGINS = z
  .array(z.unknown())
  .transform((items) => [...new Set(items.map(originOrNull).filter((origin) => origin !== null))])
  .catch([])

const STORED_SETTINGS = z
  .object({
    keepRunning: z.boolean().catch(DEFAULT_SETTINGS.keepRunning),
    backgroundNoticeShown: z.boolean().catch(DEFAULT_SETTINGS.backgroundNoticeShown),
    openAtLoginAdded: z.boolean().catch(DEFAULT_SETTINGS.openAtLoginAdded),
    agentWindow: z.enum(AGENT_WINDOW_MODES).catch(DEFAULT_SETTINGS.agentWindow),
    websites: ORIGINS,
    shareWebsite: z.unknown().transform(originOrNull),
    addedBuildWebsites: ORIGINS,
    updateRepository: z.unknown().transform((value) => (typeof value === 'string' ? repositoryName(value) : null)),
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
 * Adds the website of the build to the websites once, as the website of share links. A list without websites gets
 * the website of the build again.
 */
export function withBuildWebsite(settings: StoredSettings, buildWebsite: string): StoredSettings {
  if (settings.addedBuildWebsites.includes(buildWebsite) && settings.websites.length > 0) return settings
  return {
    ...settings,
    websites: settings.websites.includes(buildWebsite) ? settings.websites : [...settings.websites, buildWebsite],
    shareWebsite: settings.addedBuildWebsites.includes(buildWebsite) ? settings.shareWebsite : buildWebsite,
    addedBuildWebsites: settings.addedBuildWebsites.includes(buildWebsite)
      ? settings.addedBuildWebsites
      : [...settings.addedBuildWebsites, buildWebsite],
  }
}

/**
 * Returns the settings with one more website.
 *
 * @throws Error If the address is not a website that the app accepts, or if the list has it already.
 */
export function addWebsite(settings: StoredSettings, address: string): StoredSettings {
  const origin = websiteOrigin(address)
  if (!origin) throw new Error('Enter a website address that starts with https://, or http:// for this computer.')
  if (settings.websites.includes(origin)) throw new Error(`${origin} is in the list already.`)
  return { ...settings, websites: [...settings.websites, origin] }
}

/**
 * Returns the settings without a website. When it was the website of share links, the first website takes its place.
 *
 * @throws Error If it is the last website.
 */
export function removeWebsite(settings: StoredSettings, origin: string): StoredSettings {
  if (!settings.websites.includes(origin)) return settings
  if (settings.websites.length === 1) throw new Error('The app needs at least one website.')
  const websites = settings.websites.filter((website) => website !== origin)
  return { ...settings, websites, shareWebsite: settings.shareWebsite === origin ? null : settings.shareWebsite }
}

/**
 * Returns the settings with another website for share links.
 *
 * @throws Error If the website is not in the list.
 */
export function setShareWebsite(settings: StoredSettings, origin: string): StoredSettings {
  if (!settings.websites.includes(origin)) throw new Error(`${origin} is not in the list of websites.`)
  return { ...settings, shareWebsite: origin }
}

/**
 * Keeps the app settings of the main process in a JSON file. A missing or damaged file, or a missing value, gives the
 * default. A failed write keeps the change until the app quits.
 *
 * @param buildWebsite - The website of the build. The settings get it once, see {@link withBuildWebsite}.
 */
export function createAppSettings(file: string, buildWebsite: string) {
  const stored = readSettings(file)
  let settings = withBuildWebsite(stored, buildWebsite)
  if (settings !== stored) writeSettings(file, settings)
  return {
    get: (): StoredSettings => settings,
    update(change: Partial<StoredSettings> | ((current: StoredSettings) => StoredSettings)): StoredSettings {
      settings = typeof change === 'function' ? change(settings) : { ...settings, ...change }
      writeSettings(file, settings)
      return settings
    },
  }
}

export type AppSettingsStore = ReturnType<typeof createAppSettings>

/**
 * Returns the settings for the renderer.
 *
 * @param openAtLogin - The state that the system keeps, not the stored settings.
 */
export function publicSettings(
  { keepRunning, agentWindow, websites, shareWebsite }: StoredSettings,
  openAtLogin: OpenAtLogin,
): AppSettings {
  const share = shareWebsite !== null && websites.includes(shareWebsite) ? shareWebsite : websites[0]!
  return { keepRunning, openAtLogin, agentWindow, websites, shareWebsite: share }
}
