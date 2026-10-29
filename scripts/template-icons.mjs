import { execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs')
const testFile = path.join(root, 'src', 'canvas', 'icons', 'template-icons.tmp.test.ts')

const writerTest = `import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { it } from 'vitest'
import { diagramIconNames } from '@/export/html-export'
import { TEMPLATES, templateDiagrams } from '@/templates'
import { ICON_SET_FILES } from './library'
import { iconSubset } from './subset'

it('writes the icons that the templates use', () => {
  const dataDir = path.join(import.meta.dirname, 'data')
  const names = new Set(
    TEMPLATES.flatMap((template) => templateDiagrams(template).flatMap((diagram) => [...diagramIconNames(diagram)])),
  )
  const sets = Object.fromEntries(
    Object.entries(ICON_SET_FILES).map(([source, file]) => [source, JSON.parse(readFileSync(path.join(dataDir, file), 'utf8'))]),
  )
  writeFileSync(path.join(dataDir, 'templates.json'), JSON.stringify(iconSubset(names, sets)))
})
`

writeFileSync(testFile, writerTest)
try {
  execFileSync(process.execPath, [vitest, 'run', '--project', 'unit', testFile], { cwd: root, stdio: 'inherit' })
} finally {
  rmSync(testFile, { force: true })
}
