import { describe, expect, it } from 'vitest'
import { diagramIconNames } from '@/export/html-export'
import { TEMPLATES, templateDiagrams } from '@/templates'
import { ICON_SET_FILES, type IconSourceId } from './library'
import { iconSubset, type IconSetData } from './subset'

const FILES = import.meta.glob<unknown>('./data/*.json', { eager: true, import: 'default' })

describe('template icons', () => {
  it('holds exactly the icons that the templates use, as the icon sets have them', () => {
    const names = new Set(
      TEMPLATES.flatMap((template) => templateDiagrams(template).flatMap((diagram) => [...diagramIconNames(diagram)])),
    )
    const sets = Object.fromEntries(
      Object.entries(ICON_SET_FILES).map(([source, file]) => [source, FILES[`./data/${file}`] as IconSetData]),
    ) as Record<IconSourceId, IconSetData>
    expect(FILES['./data/templates.json'], 'Run node scripts/template-icons.mjs to write the file again.').toEqual(
      iconSubset(names, sets),
    )
  })
})
