import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs')
const outDir = path.resolve(process.argv[2] ?? '.diagram-previews')

const writerTest = `import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { it } from 'vitest'
import { TEMPLATES } from '@/templates'

it('writes each template as a diagram file in the dark and the light theme', () => {
  const out = process.env.TEMPLATE_FILES_DIR!
  for (const template of TEMPLATES) {
    for (const mode of ['dark', 'light'] as const) {
      const diagram = template.build()
      diagram.theme.mode = mode
      writeFileSync(path.join(out, \`\${template.id}.\${mode}.diagram.json\`), JSON.stringify(diagram, null, 2))
    }
  }
})
`

mkdirSync(outDir, { recursive: true })
const testFile = path.join(root, 'src', 'templates', 'template-files.tmp.test.ts')
writeFileSync(testFile, writerTest)
try {
  execFileSync(process.execPath, [vitest, 'run', '--project', 'unit', testFile], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, TEMPLATE_FILES_DIR: outDir },
  })
} finally {
  rmSync(testFile, { force: true })
}
