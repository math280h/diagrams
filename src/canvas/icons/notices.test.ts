import * as simpleIcons from 'simple-icons'
import { describe, expect, it } from 'vitest'
import rootPackage from '../../../package.json'
import keptLogoFile from '../../../scripts/icons/kept-logos.json'
import type { KeptLogo } from '../../../scripts/icons/sources'
import notices from '../../../THIRD-PARTY-NOTICES.md?raw'
import logoFile from './data/logos.json'
import salesforceSet from './data/salesforce.json'
import type { IconSetData } from './subset'

const logoSet = logoFile as IconSetData
const keptLogos: Readonly<Record<string, KeptLogo>> = keptLogoFile

describe('third-party notices', () => {
  const slugOf = (id: string) => id.replace(/^logo:/, '')
  const bundled = new Set(logoSet.entries.filter((entry) => !entry.retired).map((entry) => slugOf(entry.id)))
  const retired = logoSet.entries.filter((entry) => entry.retired).map((entry) => slugOf(entry.id))

  it('names the bundled Simple Icons version and logo count', () => {
    expect(notices).toContain(`simple-icons ${rootPackage.devDependencies['simple-icons']}`)
    expect(notices).toContain(`bundles ${bundled.size} of its logos`)
  })

  it('names each kept logo with the Simple Icons version that it comes from', () => {
    for (const slug of retired) {
      const logo = keptLogos[slug]
      expect(logo, `${slug} is retired, but scripts/icons/kept-logos.json does not have it`).toBeDefined()
      expect(notices).toContain(`${logo!.title} (simple-icons ${logo!.version})`)
    }
  })

  it('names the number of bundled Salesforce icons', () => {
    const images = new Set(salesforceSet.entries.map((entry) => entry.art))
    expect(notices).toContain(`The app bundles ${images.size} of them.`)
  })

  it('lists each bundled logo that has its own licence', () => {
    const licensed = [
      ...Object.values(simpleIcons).filter((icon) => icon.license && bundled.has(icon.slug)),
      ...retired.flatMap((slug) => (keptLogos[slug]?.license ? [keptLogos[slug]] : [])),
    ]
    expect(licensed.length).toBeGreaterThan(0)
    const rows = notices.split('\n')
    for (const icon of licensed) {
      const row = rows.find((line) => line.startsWith(`| ${icon.title} `))
      expect(row, icon.title).toBeDefined()
      expect(row, icon.title).toContain(icon.license!.type === 'custom' ? 'trademark' : icon.license!.type)
    }
  })
})
