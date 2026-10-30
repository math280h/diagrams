import * as simpleIcons from 'simple-icons'
import { describe, expect, it } from 'vitest'
import rootPackage from '../../../package.json'
import notices from '../../../THIRD-PARTY-NOTICES.md?raw'
import logoSet from './data/logos.json'
import salesforceSet from './data/salesforce.json'

describe('third-party notices', () => {
  const bundled = new Set(logoSet.entries.map((entry) => entry.id.replace(/^logo:/, '')))

  it('names the bundled Simple Icons version and logo count', () => {
    expect(notices).toContain(`simple-icons ${rootPackage.devDependencies['simple-icons']}`)
    expect(notices).toContain(`bundles ${bundled.size} of its logos`)
  })

  it('names the number of bundled Salesforce icons', () => {
    const images = new Set(salesforceSet.entries.map((entry) => entry.art))
    expect(notices).toContain(`The app bundles ${images.size} of them.`)
  })

  it('lists each bundled logo that has its own licence', () => {
    const licensed = Object.values(simpleIcons).filter((icon) => icon.license && bundled.has(icon.slug))
    expect(licensed.length).toBeGreaterThan(0)
    const rows = notices.split('\n')
    for (const icon of licensed) {
      const row = rows.find((line) => line.startsWith(`| ${icon.title} `))
      expect(row, icon.title).toBeDefined()
      expect(row, icon.title).toContain(icon.license!.type === 'custom' ? 'trademark' : icon.license!.type)
    }
  })
})
