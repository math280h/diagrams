export const AGENT_HOST = '127.0.0.1'
export const AGENT_PORT = 27419
export const AGENT_ENDPOINT = '/mcp'

export const DEEP_LINK_SCHEME = 'diagrams'
export const WEBSITE_ORIGIN = 'https://draw.thias.dev'
export const DEV_ORIGINS = ['http://127.0.0.1:5173', 'http://localhost:5173']
export const REPOSITORY_URL = 'https://github.com/math280h/diagrams'
/** GitHub redirects this address to the newest published release that is not a pre-release. */
export const DESKTOP_DOWNLOAD_URL = `${REPOSITORY_URL}/releases/latest`
export const REPOSITORY_API_URL = 'https://api.github.com/repos/math280h/diagrams'
export const LATEST_RELEASE_API_URL = `${REPOSITORY_API_URL}/releases/latest`
export const RELEASES_API_URL = `${REPOSITORY_API_URL}/releases?per_page=30`
export const RELEASE_ASSET_URL_PREFIX = `${REPOSITORY_URL}/releases/download/`
/**
 * The tag of the pre-release that holds the newest build of `main`. Its app versions look like `0.2.1-preview.57`.
 */
export const PREVIEW_APP_TAG = 'preview'

export const HANDOFF_PATH = '/handoff'
export const HANDOFF_TTL_MS = 60_000
export const HANDOFF_RETRY_MS = 15_000
export const HANDOFF_RETRY_INTERVAL_MS = 500
export const MAX_HANDOFF_BYTES = 8 * 1024 * 1024
export const RANDOM_KEY_BYTES = 32
/** Matches {@link RANDOM_KEY_BYTES} random bytes in base64url, the form of agent tokens and handoff codes. */
export const RANDOM_KEY_PATTERN = /^[\w-]{43}$/
export const HEX_COLOR_PATTERN = /^#[\da-f]{6}$/i

export const DIAGRAM_FILE_SUFFIX = '.diagram.json'
/** The start of the id of a diagram file that lives outside the diagrams folder. */
export const LINKED_ID_PREFIX = 'link-'

export const CLAUDE_MARKETPLACE_FOLDER = 'claude-marketplace'
export const CLAUDE_MARKETPLACE_NAME = 'diagrams'
export const CLAUDE_PLUGIN_NAME = 'diagrams'
export const CLAUDE_PLUGIN_TOKEN_KEY = 'diagrams_token'
