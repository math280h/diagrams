import { describe, expect, it } from 'vitest'
import {
  changeArea,
  changeKind,
  draftNotes,
  previousTagOf,
  repositoryOnly,
  shortcutLabels,
  toolNames,
} from './release-draft.ts'

describe('release draft', () => {
  it('sorts a change into New, Improvements or Fixes by its labels, else by its first word', () => {
    expect(changeKind({ title: 'Add a minimap', labels: [] })).toBe('New')
    expect(changeKind({ title: 'Fix the cursor on theme buttons', labels: [] })).toBe('Fixes')
    expect(changeKind({ title: 'Resize the editor panels', labels: [] })).toBe('Improvements')
    expect(changeKind({ title: 'Resize the editor panels', labels: ['bug'] })).toBe('Fixes')
    expect(changeKind({ title: 'Fix up the export', labels: ['enhancement'] })).toBe('New')
  })

  it('takes the area with the most changed files, and leaves tests, docs and format samples out', () => {
    expect(changeArea(['src/player/PlayerStage.tsx', 'src/engine/engine.ts', 'src/editor/TopBar.tsx'])).toBe(
      'Flows and Present',
    )
    expect(changeArea(['src/agent/handlers/read.ts', 'docs/ARCHITECTURE.md', 'e2e/a.spec.ts'])).toBe(
      'MCP server and skills',
    )
    expect(changeArea(['.github/workflows/ci.yml', 'src/persistence/formats/v15.json'])).toBe('Build and docs')
    expect(changeArea(['actions/render/main.mjs', 'actions/render/action.yml'])).toBe('GitHub Action')
    expect(changeArea(['electron-builder.ts', 'scripts/sbom-components.ts'])).toBe('Desktop app')
    expect(changeArea(['actions/render/main.mjs', 'electron-builder.ts'])).toBe('Desktop app')
    expect(
      changeArea([
        'actions/render/main.mjs',
        'actions/render/lib.test.mjs',
        'actions/render/png.test.mjs',
        'src/library/Library.tsx',
        'src/library/Hero.tsx',
      ]),
    ).toBe('Library and templates')
  })

  it('finds the pull requests that change only files of the repository', () => {
    expect(repositoryOnly(['e2e/insert-search.spec.ts'])).toBe(true)
    expect(repositoryOnly(['package.json', 'pnpm-lock.yaml'])).toBe(true)
    expect(repositoryOnly(['.github/workflows/ci.yml', 'scripts/coverage.ts', 'vitest.config.ts', 'CLAUDE.md'])).toBe(
      true,
    )
    expect(repositoryOnly(['src/store/actions.test.ts', 'docs/ARCHITECTURE.md'])).toBe(true)
    expect(repositoryOnly(['package.json', 'src/export/video.ts'])).toBe(false)
    expect(repositoryOnly(['electron-builder.ts'])).toBe(false)
    expect(repositoryOnly(['actions/render/main.mjs'])).toBe(false)
    expect(repositoryOnly([])).toBe(false)
  })

  it('finds the tools and the shortcut labels in their source files', () => {
    expect(
      toolNames('const x = 1\nexport const TOOL_DEFINITIONS = {\n  get_diagram: {\n    a: {\n  render_image: {\n'),
    ).toEqual(['get_diagram', 'render_image'])
    expect(shortcutLabels("KEYS = { label: 'not this' }\nexport const SHORTCUT_GROUPS = [{ label: 'Undo' }]")).toEqual([
      'Undo',
    ])
  })

  it('takes the previous release, or for a preview the previous tag of any kind', () => {
    const tags = ['v0.1.9', 'v0.1.10-beta.1', 'v0.1.10', 'v0.2.0-beta.1', 'preview']
    expect(previousTagOf('v0.2.0', [...tags, 'v0.2.0'])).toBe('v0.1.10')
    expect(previousTagOf('v0.2.0-beta.2', [...tags, 'v0.2.0-beta.2'])).toBe('v0.2.0-beta.1')
    expect(previousTagOf('v0.1.9', tags)).toBeNull()
  })

  it('writes the sections by kind and area without the repository changes, the tools and shortcuts that changed, and a hidden media list', () => {
    const notes = draftNotes({
      repository: 'owner/diagrams',
      previousTag: 'v0.1.4',
      tag: 'v0.1.5',
      pullRequests: [
        { number: 66, title: 'Add a minimap', labels: [], files: ['src/canvas/Minimap.tsx'] },
        { number: 64, title: 'Resize the editor panels', labels: [], files: ['src/editor/SidePanel.tsx'] },
        { number: 61, title: 'Fix a flaky test', labels: [], files: ['e2e/insert-search.spec.ts'] },
      ],
      tools: { before: ['get_diagram'], after: ['get_diagram', 'lint_diagram'] },
      shortcuts: { before: ['Undo'], after: ['Undo', 'Explore a node and its neighbours'] },
    })
    expect(notes).toBe(`<!-- Before you publish, add a still and a short clip (Export, then Animation) of each new item:
     - Add a minimap
-->

## New

### Canvas

- Add a minimap (#66)

## Improvements

### Editor

- Resize the editor panels (#64)

## MCP server

- New tools: \`lint_diagram\`.

## Keyboard shortcuts

- Explore a node and its neighbours

**Full changelog**: https://github.com/owner/diagrams/compare/v0.1.4...v0.1.5
`)
  })
})
