import { execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs')
const testFile = path.join(root, 'src', 'share', 'link-dictionary.tmp.test.ts')

const writerTest = `import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { it } from 'vitest'
import { TEMPLATES, templateDiagrams } from '@/templates'
import { DICTIONARY_CHARS, linkJson } from './share-link'

it('writes the dictionary of share links', () => {
  const texts = [...new Set(TEMPLATES.flatMap((template) => templateDiagrams(template).map(linkJson)))]
  const joined = texts.toSorted((a, b) => b.length - a.length).join('\\n')
  const tail = joined.length > DICTIONARY_CHARS ? joined.slice(-DICTIONARY_CHARS) : joined
  const whole = tail === joined ? tail : tail.slice(tail.indexOf('\\n') + 1)
  writeFileSync(path.join(import.meta.dirname, 'link-dictionary.txt'), whole)
})
`

writeFileSync(testFile, writerTest)
try {
  execFileSync(process.execPath, [vitest, 'run', '--project', 'unit', testFile], { cwd: root, stdio: 'inherit' })
} finally {
  rmSync(testFile, { force: true })
}
