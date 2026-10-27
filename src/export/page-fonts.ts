import atkinsonMonoLicense from '@fontsource-variable/atkinson-hyperlegible-mono/LICENSE?raw'
import atkinsonMonoExt from '@fontsource-variable/atkinson-hyperlegible-mono/files/atkinson-hyperlegible-mono-latin-ext-wght-normal.woff2?url'
import atkinsonMonoLatin from '@fontsource-variable/atkinson-hyperlegible-mono/files/atkinson-hyperlegible-mono-latin-wght-normal.woff2?url'
import atkinsonLicense from '@fontsource-variable/atkinson-hyperlegible-next/LICENSE?raw'
import atkinsonExt from '@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-ext-wght-normal.woff2?url'
import atkinsonLatin from '@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2?url'
import hostLicense from '@fontsource-variable/host-grotesk/LICENSE?raw'
import hostExt from '@fontsource-variable/host-grotesk/files/host-grotesk-latin-ext-wght-normal.woff2?url'
import hostLatin from '@fontsource-variable/host-grotesk/files/host-grotesk-latin-wght-normal.woff2?url'
import plexLicense from '@fontsource-variable/ibm-plex-sans/LICENSE?raw'
import plexExt from '@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-ext-wght-normal.woff2?url'
import plexLatin from '@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2?url'
import interLicense from '@fontsource-variable/inter/LICENSE?raw'
import interExt from '@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2?url'
import interLatin from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'
import jetbrainsLicense from '@fontsource-variable/jetbrains-mono/LICENSE?raw'
import jetbrainsExt from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-normal.woff2?url'
import jetbrainsLatin from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url'
import fragmentLicense from '@fontsource/fragment-mono/LICENSE?raw'
import fragmentExt from '@fontsource/fragment-mono/files/fragment-mono-latin-ext-400-normal.woff2?url'
import fragmentLatin from '@fontsource/fragment-mono/files/fragment-mono-latin-400-normal.woff2?url'
import plexMonoLicense from '@fontsource/ibm-plex-mono/LICENSE?raw'
import plexMono400Ext from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-ext-400-normal.woff2?url'
import plexMono400Latin from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url'
import plexMono500Ext from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-ext-500-normal.woff2?url'
import plexMono500Latin from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2?url'
import type { DiagramTheme } from '@/model/schema'

// The ranges of the Fontsource subset files `latin` and `latin-ext`.
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'

export interface FontFile {
  family: string
  /** A CSS font weight, or a range such as `300 800` for a variable font. */
  weight: string
  unicodeRange: string
  url: string
}

export interface FontFamily {
  files: FontFile[]
  license: string
}

function family(name: string, weights: Record<string, [latin: string, latinExt: string]>, license: string): FontFamily {
  return {
    license,
    files: Object.entries(weights).flatMap(([weight, [latin, latinExt]]) => [
      { family: name, weight, unicodeRange: LATIN, url: latin },
      { family: name, weight, unicodeRange: LATIN_EXT, url: latinExt },
    ]),
  }
}

const HOST = family('Host Grotesk Variable', { '300 800': [hostLatin, hostExt] }, hostLicense)
const FRAGMENT = family('Fragment Mono', { '400': [fragmentLatin, fragmentExt] }, fragmentLicense)

/** The fonts of each font pair, with the licence text of each family. The page chrome uses the `host` pair. */
export const FONT_PAIR_FAMILIES: Record<DiagramTheme['fonts'], FontFamily[]> = {
  host: [HOST, FRAGMENT],
  atkinson: [
    family('Atkinson Hyperlegible Next Variable', { '200 800': [atkinsonLatin, atkinsonExt] }, atkinsonLicense),
    family(
      'Atkinson Hyperlegible Mono Variable',
      { '200 800': [atkinsonMonoLatin, atkinsonMonoExt] },
      atkinsonMonoLicense,
    ),
  ],
  inter: [
    family('Inter Variable', { '100 900': [interLatin, interExt] }, interLicense),
    family('JetBrains Mono Variable', { '100 800': [jetbrainsLatin, jetbrainsExt] }, jetbrainsLicense),
  ],
  plex: [
    family('IBM Plex Sans Variable', { '100 700': [plexLatin, plexExt] }, plexLicense),
    family(
      'IBM Plex Mono',
      { '400': [plexMono400Latin, plexMono400Ext], '500': [plexMono500Latin, plexMono500Ext] },
      plexMonoLicense,
    ),
  ],
}

/** Returns the font families that a page with a diagram in this font pair needs. */
export function pageFontFamilies(fonts: DiagramTheme['fonts']): FontFamily[] {
  return [...new Set([...FONT_PAIR_FAMILIES.host, ...FONT_PAIR_FAMILIES[fonts]])]
}
