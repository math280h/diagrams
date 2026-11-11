import '@/index.css'
import '@/styles/canvas.css'
import { createLucideIcon } from 'lucide-react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loaded, preloadIcons } from '@/canvas/icon-cache'
import { registerIconSet } from '@/canvas/icons/library'
import { errorMessage } from '@/lib/error-message'
import { migrate } from '@/persistence/migrations'
import { useSettings } from '@/store/settings-store'
import { activeTheme } from '@/themes/active'
import { applyAppTheme } from '@/themes/apply'
import { DEFAULT_THEME_IDS } from '@/themes/built-in'
import { themeFileSchema, themeOfFile, type Theme } from '@/themes/schema'
import { useThemeStore } from '@/themes/store'
import { addThemeStyles } from '@/themes/styles'
import { THEME_BASES, type ThemeBase } from '@/themes/tokens'
import { PAGE_DATA_IDS, type PageIcons } from './page-data'
import { StandalonePlayer } from './StandalonePlayer'

function readJson(id: string): unknown {
  const text = document.getElementById(id)?.textContent
  return text ? JSON.parse(text) : null
}

function pageTheme(value: unknown): Theme | null {
  if (typeof value !== 'object' || value === null) return null
  const { id, ...file } = value as { id?: unknown }
  const parsed = themeFileSchema.safeParse(file)
  return typeof id === 'string' && parsed.success ? themeOfFile(id, parsed.data) : null
}

/** Shows the themes of the page, the light or the dark one as the system setting of the reader is. */
function followPageThemes() {
  const data = (readJson(PAGE_DATA_IDS.themes) ?? {}) as Partial<Record<ThemeBase, unknown>>
  const themes = THEME_BASES.flatMap((base) => {
    const theme = pageTheme(data[base])
    return theme && theme.base === base ? [theme] : []
  })
  addThemeStyles(themes)
  useThemeStore.setState({ files: themes.map((theme) => ({ name: theme.id, theme, problem: null, unknown: [] })) })
  const idOf = (base: ThemeBase) => themes.find((theme) => theme.base === base)?.id ?? DEFAULT_THEME_IDS[base]
  useSettings.setState({
    themeMode: 'system',
    themes: { light: idOf('light'), dark: idOf('dark') },
    contrastThemes: { light: null, dark: null },
  })
  const apply = () => applyAppTheme(activeTheme())
  apply()
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply)
}

function registerIcons(icons: PageIcons | null): Promise<void> {
  if (!icons) return Promise.resolve()
  for (const set of icons.sets) {
    registerIconSet({ ...set, byId: new Map(set.entries.map((entry) => [entry.id, entry])) })
  }
  for (const [name, data] of Object.entries(icons.lucide)) loaded.set(name, createLucideIcon(data))
  return preloadIcons(icons.sets.flatMap((set) => set.entries.map((entry) => entry.id)))
}

const root = createRoot(document.getElementById('root')!)
followPageThemes()
try {
  const diagram = migrate(readJson(PAGE_DATA_IDS.diagram))
  void registerIcons(readJson(PAGE_DATA_IDS.icons) as PageIcons | null).then(() =>
    root.render(
      <StrictMode>
        <StandalonePlayer diagram={diagram} />
      </StrictMode>,
    ),
  )
} catch (error) {
  root.render(<p className="p-6 text-sm text-destructive">This page cannot show its diagram: {errorMessage(error)}</p>)
}
