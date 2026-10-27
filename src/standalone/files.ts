/** The paths of the standalone player files, relative to the base of the web build. */
export const PLAYER_FILES = {
  script: 'standalone/player.js',
  style: 'standalone/player.css',
  licenses: 'standalone/licenses.txt',
} as const

export type PlayerFiles = Record<keyof typeof PLAYER_FILES, string>
