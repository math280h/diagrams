import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  HEADLINE_FEATURES,
  MORE_FEATURES,
  README_FEATURES_END,
  README_FEATURES_START,
  readmeFeatures,
} from '../src/library/feature-list.ts'

describe('features', () => {
  it('match the features in the README', () => {
    const readme = readFileSync('README.md', 'utf8')
    const start = readme.indexOf(README_FEATURES_START)
    const end = readme.indexOf(README_FEATURES_END) + README_FEATURES_END.length
    expect(readme.slice(start, end), 'Run node scripts/readme-features.ts').toBe(readmeFeatures())
  })

  it('have titles that appear once', () => {
    const titles = [...HEADLINE_FEATURES, ...MORE_FEATURES].map((feature) => feature.title)
    expect(new Set(titles).size).toBe(titles.length)
  })
})
