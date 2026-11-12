import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSettings, type ThemeMode } from '@/store/settings-store'
import { useActiveTheme } from '@/themes/active'
import { allThemes, useThemeStore } from '@/themes/store'
import { ThemeSwatch } from '@/themes/ThemeSwatch'

const THEME_MODES: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function ThemeToggle() {
  const themeMode = useSettings((state) => state.themeMode)
  const setThemeMode = useSettings((state) => state.setThemeMode)
  const setTheme = useSettings((state) => state.setTheme)
  const active = useActiveTheme()
  const files = useThemeStore((state) => state.files)
  const themes = allThemes(files).filter((theme) => theme.base === active.base)
  const mode = THEME_MODES.find((option) => option.value === themeMode) ?? THEME_MODES[2]!
  const ModeIcon = mode.icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Theme: ${active.name}`} />}>
        <ModeIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Mode</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={themeMode} onValueChange={(value) => setThemeMode(value as ThemeMode)}>
            {THEME_MODES.map(({ value, label, icon: OptionIcon }) => (
              <DropdownMenuRadioItem key={value} value={value}>
                <OptionIcon /> {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>{active.base === 'dark' ? 'Dark themes' : 'Light themes'}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={active.id} onValueChange={(id) => setTheme(active.base, String(id))}>
            {themes.map((theme) => (
              <DropdownMenuRadioItem key={theme.id} value={theme.id}>
                <ThemeSwatch theme={theme} /> {theme.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
