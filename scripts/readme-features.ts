import { readFileSync, writeFileSync } from 'node:fs'
import { README_FEATURES_END, README_FEATURES_START, readmeFeatures } from '../src/library/feature-list.ts'

const readmeFile = new URL('../README.md', import.meta.url)
const readme = readFileSync(readmeFile, 'utf8')
const start = readme.indexOf(README_FEATURES_START)
const end = readme.indexOf(README_FEATURES_END)
if (start === -1 || end === -1) throw new Error(`README.md has no ${README_FEATURES_START} and ${README_FEATURES_END}.`)
writeFileSync(readmeFile, readme.slice(0, start) + readmeFeatures() + readme.slice(end + README_FEATURES_END.length))
console.log('Wrote the features of README.md from src/library/feature-list.ts.')
