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
import { PAGE_DATA_IDS, type PageIcons } from './page-data'
import { StandalonePlayer } from './StandalonePlayer'

function readJson(id: string): unknown {
  const text = document.getElementById(id)?.textContent
  return text ? JSON.parse(text) : null
}

function followSystemTheme() {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = () => {
    const theme = query.matches ? 'dark' : 'light'
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
    useSettings.setState({ theme })
  }
  apply()
  query.addEventListener('change', apply)
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
followSystemTheme()
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
