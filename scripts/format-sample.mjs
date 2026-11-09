import { execFileSync } from 'node:child_process'
import { lstatSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const outDir = path.join(root, 'src', 'persistence', 'formats')
const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs')
const ref = process.argv[2]
const SAMPLE_TEMPLATES = ['order-system', 'checkout-flow', 'event-pipeline']

const sampleTest = `import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { it } from 'vitest'
import { z } from 'zod'
import { DIAGRAM_VERSION, diagramSchema } from '@/model/schema'
import { TEMPLATES } from '@/templates'
import { fieldSamples } from ${JSON.stringify(path.join(root, 'scripts', 'format-fields.ts').replaceAll('\\', '/'))}

it('writes the samples of the diagram format', () => {
  const out = process.env.FORMAT_SAMPLE_DIR!
  const source = process.env.FORMAT_SAMPLE_SOURCE
  const file = (kind: string) => path.join(out, \`v\${DIAGRAM_VERSION}\${kind}.json\`)
  const read = (kind: string, build: () => unknown) => {
    if (existsSync(file(kind))) return JSON.parse(readFileSync(file(kind), 'utf8'))
    const value = build()
    writeFileSync(file(kind), JSON.stringify(value, null, 2))
    return value
  }
  const ids: string[] = ${JSON.stringify(SAMPLE_TEMPLATES)}
  const sample = read('', () => ({
    version: DIAGRAM_VERSION,
    source,
    diagrams: TEMPLATES.filter((template) => ids.includes(template.id)).map((template) => template.build()),
  }))
  const schema = read('.schema', () => z.toJSONSchema(diagramSchema))
  read('.fields', () => {
    const accepts = (diagram: unknown) => {
      const parsed = diagramSchema.safeParse(diagram)
      return parsed.success ? JSON.parse(JSON.stringify(parsed.data)) : null
    }
    const fields = fieldSamples(schema, sample.diagrams, accepts)
    if (fields.missing.length > 0) throw new Error(\`No sample fills: \${fields.missing.join(', ')}\`)
    return { version: DIAGRAM_VERSION, source, diagrams: fields.diagrams }
  })
})
`

function run(command, args, cwd, env = {}) {
  execFileSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } })
}

function writeSample(cwd, source) {
  const testFile = path.join(cwd, 'src', 'persistence', 'format-sample.tmp.test.ts')
  writeFileSync(testFile, sampleTest)
  try {
    run(process.execPath, [vitest, 'run', '--project', 'unit', testFile], cwd, {
      FORMAT_SAMPLE_DIR: outDir,
      FORMAT_SAMPLE_SOURCE: source,
    })
  } finally {
    rmSync(testFile, { force: true })
  }
}

function assertNoLinks(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    const full = path.join(entry.parentPath, entry.name)
    if (lstatSync(full).isSymbolicLink()) throw new Error(`${full} is a link. Remove it by hand, without recursion.`)
  }
}

if (ref) {
  // Node looks for node_modules in each parent folder, so a worktree inside the repo uses the node_modules of the repo.
  const worktree = path.join(root, '.format-samples', ref.replace(/[^\w.-]/g, '_'))
  run('git', ['worktree', 'add', '--detach', worktree, ref], root)
  try {
    writeSample(worktree, ref)
  } finally {
    assertNoLinks(worktree)
    run('git', ['worktree', 'remove', '--force', worktree], root)
    rmSync(path.join(root, '.format-samples'), { recursive: true, force: true })
  }
} else {
  writeSample(root, 'working tree')
}
run(process.execPath, [path.join(root, 'node_modules', 'oxfmt', 'bin', 'oxfmt'), outDir], root)
