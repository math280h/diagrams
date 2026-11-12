import { Copy, Download, FileInput, FolderOpen, Trash2 } from 'lucide-react'
import { useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, Section, Segmented } from '@/editor/inspector/controls'
import { useFolderStore } from '@/folder/folder-store'
import { downloadBlob } from '@/lib/download'
import { reportError } from '@/store/problem-store'
import { useSettings, type ThemeMode } from '@/store/settings-store'
import { showTheme, useActiveTheme } from './active'
import { checkThemeContrast } from './contrast'
import { fullThemeFile, themeFileName, themeFileText } from './copy'
import { parseThemeText, type Theme } from './schema'
import { addThemeFile, removeImportedTheme, revealThemeFolder } from './sources'
import { allThemes, customThemeId, findTheme, useThemeStore, type CustomThemeFile, type ThemePlace } from './store'
import { ThemeSwatch } from './ThemeSwatch'
import { THEME_FILE_SUFFIX, type ThemeBase } from './tokens'

const NONE = 'none'

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

function ThemeSelect({
  label,
  value,
  themes,
  noneLabel,
  onChange,
}: {
  label: string
  value: string | null
  themes: readonly Theme[]
  noneLabel?: string
  onChange: (id: string | null) => void
}) {
  const items = [
    ...(noneLabel ? [{ value: NONE, label: noneLabel, theme: null }] : []),
    ...themes.map((theme) => ({ value: theme.id, label: theme.name, theme })),
  ]
  const selected = value ?? NONE
  if (!items.some((item) => item.value === selected)) {
    items.push({ value: selected, label: `${selected} (missing)`, theme: null })
  }
  const current = items.find((item) => item.value === selected)!
  return (
    <Select<string>
      value={selected}
      onValueChange={(next) => next !== null && onChange(next === NONE ? null : next)}
      items={items}
    >
      <SelectTrigger size="sm" aria-label={label} className="w-full min-w-0 rounded-lg px-2 text-xs">
        <SelectValue className="flex min-w-0 items-center gap-1.5">
          {() => (
            <>
              {current.theme && <ThemeSwatch theme={current.theme} className="size-3.5" />}
              <span className="min-w-0 truncate">{current.label}</span>
            </>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false} className="max-h-80">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value} className="text-xs">
            {item.theme && <ThemeSwatch theme={item.theme} className="size-3.5" />}
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ThemeFileStatus({ file }: { file: CustomThemeFile }) {
  const failures = useMemo(() => (file.theme ? checkThemeContrast(file.theme) : []), [file.theme])
  if (file.problem) return <p className="text-xs break-words text-destructive">{file.problem}</p>
  return (
    <>
      {file.unknown.length > 0 && (
        <p className="text-xs break-words text-muted-foreground">Unknown keys: {file.unknown.join(', ')}</p>
      )}
      {failures.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer text-warn">
            {failures.length === 1 ? '1 colour pair is' : `${failures.length} colour pairs are`} below their contrast
          </summary>
          <ul className="mt-1 space-y-0.5 pl-3">
            {failures.map((failure) => (
              <li key={failure.name} className="break-words">
                {failure.name}: {failure.ratio.toFixed(1)}:1, needs {failure.min}:1
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

function placeNote(place: ThemePlace, folderName: string | null): string {
  if (place === 'desktop') return 'Your themes are the files in the themes folder of your diagrams folder.'
  if (place === 'folder') return `Your themes are the files in the themes folder of ${folderName ?? 'the open folder'}.`
  return 'Open a folder to keep your themes as files there, or import a theme file into this browser.'
}

function CustomThemes({ active }: { active: Theme }) {
  const files = useThemeStore((state) => state.files)
  const place = useThemeStore((state) => state.place)
  const folderName = useFolderStore((state) => state.name)
  const input = useRef<HTMLInputElement>(null)

  const copy = async () => {
    const name = `${active.name} copy`
    const fileName = themeFileName(name, new Set(files.map((file) => file.name)))
    const text = themeFileText(fullThemeFile(active, name))
    if (place === 'browser') {
      downloadBlob(new Blob([text], { type: 'application/json' }), `${fileName}${THEME_FILE_SUFFIX}`)
      return
    }
    try {
      await addThemeFile({ name: fileName, text })
    } catch (error) {
      reportError('Could not copy the theme.', error)
      return
    }
    const copied = findTheme(customThemeId(fileName))
    if (copied) showTheme(copied)
    toast.success(`Copied the theme to themes/${fileName}${THEME_FILE_SUFFIX}`)
  }

  const importFile = async (file: File) => {
    const text = await file.text()
    const fileName = themeFileName(file.name.replace(/(\.theme)?\.json$/i, ''), new Set())
    const parsed = parseThemeText(customThemeId(fileName), text)
    if (!parsed.ok) {
      toast.error(`The theme file cannot be used: ${parsed.problem}`)
      return
    }
    try {
      await addThemeFile({ name: fileName, text })
    } catch (error) {
      reportError('Could not import the theme.', error)
      return
    }
    showTheme(findTheme(parsed.theme.id) ?? parsed.theme)
    toast.success(`Imported the theme ${parsed.theme.name}`)
  }

  return (
    <div role="group" aria-label="Your themes" className="space-y-2 pt-1">
      <p className="text-xs text-muted-foreground">{placeNote(place, folderName)}</p>
      <div className="grid gap-1.5">
        <Button variant="outline" size="sm" className="justify-start" onClick={() => void copy()}>
          {place === 'browser' ? <Download /> : <Copy />}
          {place === 'browser' ? `Download ${active.name} as a theme file` : `Copy ${active.name} as a custom theme`}
        </Button>
        {place === 'desktop' && (
          <Button variant="outline" size="sm" className="justify-start" onClick={() => void revealThemeFolder()}>
            <FolderOpen /> Show the themes folder
          </Button>
        )}
        {place === 'browser' && (
          <>
            <Button variant="outline" size="sm" className="justify-start" onClick={() => input.current?.click()}>
              <FileInput /> Import a theme file
            </Button>
            <input
              ref={input}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void importFile(file)
              }}
            />
          </>
        )}
      </div>
      {files.length > 0 && (
        <ul className="space-y-2" aria-label="Theme files">
          {files.map((file) => (
            <li key={file.name} className="space-y-1">
              <div className="flex min-w-0 items-center gap-1.5 text-xs">
                {file.theme && <ThemeSwatch theme={file.theme} className="size-3.5" />}
                <span className="min-w-0 flex-1 truncate" title={`${file.name}${THEME_FILE_SUFFIX}`}>
                  {file.theme?.name ?? `${file.name}${THEME_FILE_SUFFIX}`}
                </span>
                {place === 'browser' && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove the theme ${file.theme?.name ?? file.name}`}
                    onClick={() => removeImportedTheme(file.name)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
              <ThemeFileStatus file={file} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Sets the theme mode, the theme of each base, the themes for more contrast, and shows the themes of the user. */
export function ThemeSettings() {
  const themeMode = useSettings((state) => state.themeMode)
  const setThemeMode = useSettings((state) => state.setThemeMode)
  const themes = useSettings((state) => state.themes)
  const setTheme = useSettings((state) => state.setTheme)
  const contrastThemes = useSettings((state) => state.contrastThemes)
  const setContrastTheme = useSettings((state) => state.setContrastTheme)
  const files = useThemeStore((state) => state.files)
  const active = useActiveTheme()
  const all = allThemes(files)
  const ofBase = (base: ThemeBase) => all.filter((theme) => theme.base === base)
  const highOfBase = (base: ThemeBase) => ofBase(base).filter((theme) => theme.contrast === 'high')

  return (
    <Section title="Theme">
      <Field label="Mode">
        <Segmented label="Theme mode" value={themeMode} onChange={setThemeMode} options={MODES} />
      </Field>
      <Field label="Light">
        <ThemeSelect
          label="Light theme"
          value={themes.light}
          themes={ofBase('light')}
          onChange={(id) => id && setTheme('light', id)}
        />
      </Field>
      <Field label="Dark">
        <ThemeSelect
          label="Dark theme"
          value={themes.dark}
          themes={ofBase('dark')}
          onChange={(id) => id && setTheme('dark', id)}
        />
      </Field>
      <div role="group" aria-label="When the system asks for more contrast" className="space-y-2.5">
        <p className="text-xs text-muted-foreground">When the system asks for more contrast</p>
        <Field label="Light">
          <ThemeSelect
            label="High contrast light theme"
            value={contrastThemes.light}
            themes={highOfBase('light')}
            noneLabel="Keep the light theme"
            onChange={(id) => setContrastTheme('light', id)}
          />
        </Field>
        <Field label="Dark">
          <ThemeSelect
            label="High contrast dark theme"
            value={contrastThemes.dark}
            themes={highOfBase('dark')}
            noneLabel="Keep the dark theme"
            onChange={(id) => setContrastTheme('dark', id)}
          />
        </Field>
      </div>
      <CustomThemes active={active} />
    </Section>
  )
}
